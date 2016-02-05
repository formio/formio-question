angular.module('formio.question', ['formio', 'nvd3'])
  .directive('formioQuestion', function() {
    var formioQuestionTemplate =
      '<div class="formio-question-form"></div>' +
      '<button ng-if="previewResults" class="btn btn-success btn-sm" ng-click="showAnalytics()">Results</button>' +
      '<button class="btn btn-primary btn-sm" ng-click="save()">Submit</button>';

    return {
      restrict: 'E',
      replace: true,
      template:
        '<div>'+
          '<i ng-show="!questionLoaded" id="formio-loading" style="font-size: 2em;" class="glyphicon glyphicon-refresh glyphicon-spin"></i>'+
          '<div ng-repeat="alert in formioAlerts" class="alert alert-{{ alert.type }}" role="alert">'+
            '{{ alert.message }}'+
          '</div>' +
          '<div class="formio-question">' +
          formioQuestionTemplate +
          '</div>' +
        '</div>',
      scope: {
        src: '=',
        question: '=',
        submission: '=',
        previewResults: '=',
        updateAnswer: '=',
        chartOptions: '='
      },
      link: function(scope, element) {
        scope.questionLoaded = false;
        scope.questionElement = angular.element('.formio-question', element);
      },
      controller: [
        '$scope',
        '$compile',
        '$element',
        'Formio',
        'FormioScope',
        '$http',
        'FormioUtils',
        function(
          $scope,
          $compile,
          $element,
          Formio,
          FormioScope,
          $http,
          FormioUtils
        ) {
          $scope.formio = new Formio($scope.src);
          $scope._chartOptions = $scope.chartOptions || {
            chart: {
              type: 'pieChart',
              height: 500,
              x: function(d){return d.key;},
              y: function(d){return d.y;},
              showLabels: true,
              duration: 500,
              labelThreshold: 0.01,
              labelSunbeamLayout: true,
              legend: {
                margin: {
                  top: 5,
                  right: 35,
                  bottom: 5,
                  left: 0
                }
              }
            }
          };

          $scope.page = {};
          $scope.form = {};
          $http.get($scope.src)
            .then(function(data) {
              data = data.data;
              $scope.form = data;

              /**
               * Show the analytics for this specific question.
               */
              $scope.showAnalytics = function() {
                $http.get($scope.src + '/submission?limit=4294967295')
                  .then(function(data) {
                    data = data.data;

                    // Create a map of the responses, where key:response and value:quantity.
                    var count = {};
                    _(data)
                      .map('data.' + $scope.question)
                      .value()
                      .forEach(function(e) {
                        count[e] = count[e]+1 || 1;
                      });

                    // Format the response data for the given chart type.
                    $scope.chartData = _(count)
                      .map(function(value, key) {
                        return {
                          key: key,
                          y: value
                        };
                      })
                      .value();

                    $scope.questionElement.html($compile(
                      '<span>Selection:{{results}}</span><br>' +
                      '<nvd3 options="_chartOptions" data="chartData"></nvd3>' +
                      '<button ng-if="updateAnswer" class="btn btn-success btn-sm" ng-click="resetQuestion()">Question</button>'
                    )($scope));
                  })
                  .catch(function(err) {
                    console.error(err);
                  });
              };

              $scope.showQuestion = function() {
                if (!$scope.updateAnswer) {
                  $scope.showAnalytics();
                }

                $scope.page.components = [FormioUtils.getComponent(data.components, $scope.question)];
                var pageElement = angular.element(document.createElement('formio'));

                angular.element(document.getElementsByClassName('formio-question-form'))
                  .html($compile(pageElement.attr({
                    form: 'page',
                    submission: 'submission'
                  }))($scope));
                $scope.questionLoaded = true;
                $scope.formioAlerts = [];
              };
              $scope.showQuestion();

              $scope.resetQuestion = function() {
                $scope.questionElement.html($compile(formioQuestionTemplate)($scope));
                $scope.showQuestion();
              };

              /**
               * Save the current submission, using the form src.
               */
              $scope.save = function() {
                var method = _.has($scope.submission, '_id')
                  ? 'put'
                  : 'post';
                var url = (method === 'post')
                  ? $scope.src + '/submission'
                  : $scope.src + '/submission/' + $scope.submission._id;
                $http[method](url, $scope.submission)
                  .then(function() {
                    $scope.showAnalytics();
                  })
                  .catch(function(err) {
                    console.error(err);
                  });
              };
            })
            .catch(function(err) {
              console.error(err);
            });
        }
      ]
    };
  });
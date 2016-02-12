angular.module('formio.question', ['formio', 'nvd3'])
  .directive('formioQuestion', function() {
    var formioQuestionTemplate =
      '<div class="formio-question-form"></div>' +
      '<button ng-if="previewResults && (view === \'question\')" class="btn btn-success btn-sm" ng-click="showAnalytics()">Results</button>' +
      '<button ng-if="updateAnswer && (view === \'analytics\')" class="btn btn-success btn-sm" ng-click="resetQuestion()">Question</button>' +
      '<button class="btn btn-primary btn-sm pull-right" ng-click="save()">Submit</button>';

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
        form: '=',
        submissions: '=',
        submission: '=',
        previewResults: '=',
        updateAnswer: '=',
        chart: '=',
        chartAdvanced: '=',
        chartDataCustomizer: '=',
        waitForPromise: '='
      },
      link: function link(scope, element, attrs, controller, transcludeFn) {
        scope.questionLoaded = false;
        scope.questionElement = angular.element('.formio-question', element);
        scope.questionElementForm = angular.element('.formio-question-form', element);
      },
      controller: [
        '$scope',
        '$compile',
        '$element',
        'Formio',
        'FormioScope',
        '$http',
        'FormioUtils',
        '$q',
        '$timeout',
        function(
          $scope,
          $compile,
          $element,
          Formio,
          FormioScope,
          $http,
          FormioUtils,
          $q,
          $timeout
        ) {
          // The available graph types.
          var types = ['table', 'pie'];
          $scope.views = {
            question: 'question',
            analytics: 'analytics'
          };
          $scope.view = $scope.views.question;

          /**
           * Generates the html for a table display of q/a.
           */
          var makeTable = function() {
            return '<div class="row">' +
              '<div class="col-md-12">' +
                '<h3>Results</h3>' +
                '<table class="table table-hover table-condensed">' +
                  '<thead>' +
                    '<tr>' +
                      '<th>Answer</th>' +
                      '<th>Count</th>' +
                    '</tr>' +
                  '</thead>' +
                  '<tbody>' +
                    '<tr ng-repeat="answer in data track by $index">' +
                      '<td>{{answer.label}}</td>' +
                      '<td>{{answer.value}}</td>' +
                    '</tr>' +
                  '</tbody>' +
                '</table>' +
              '</div>' +
            '</div>';
          };

          /**
           * Takes the common q/a result format and mutates it for graphing use in d3.
           *
           * @returns {*}
           */
          var normalizeData = function(type) {
            if (['table'].indexOf(type) !== -1) {
              return _($scope.data)
                .map(function(value, key) {
                  return {
                    label: key,
                    value: value
                  };
                })
                .value();
            }
            else if (['pie'].indexOf(type) !== -1) {
              return _($scope.data)
                .map(function(value, key) {
                  return {
                    key: key,
                    y: value
                  };
                })
                .value();
            }
          };

          /**
           * Makes a graph using the current type and data.
           *
           * @returns {string}
           */
          var makeGraph = function() {
            // Check for advanced usage.
            if ($scope.chartAdvanced &&_.get($scope.chartAdvanced, 'chart.type') && $scope.chartDataCustomizer) {
              // Make a nvd3 chart with the advanced options and mutate the data with the customizer.
              $scope.data = $scope.chartDataCustomizer($scope.data);
              return '<nvd3 options="chartAdvanced" data="data"></nvd3>'
            }

            // Determine the chart type.
            var chart = ($scope.chart || 'table').toString().toLowerCase();

            // Continue with regular usage.
            $scope.data = normalizeData(chart);
            if (types.indexOf(chart) === -1) {
              console.error('Unknown type given: ' + chart);
            }

            if (chart === 'table') {
              return makeTable();
            }
            else if (chart === 'pie') {
              $scope.options = $scope.chartAdvanced || {
                chart: {
                  type: 'pieChart',
                  height: 500,
                  x: function(d) { return d.key },
                  y: function(d) { return d.y },
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

              return '<nvd3 options="options" data="data"></nvd3>'
            }
          };

          /**
           * Show the analytics for this specific question.
           */
          $scope.showAnalytics = function() {
            $scope.view = $scope.views.analytics;
            /**
             * Using all the submission data, filter it for the specific question.
             *
             * @param {String} question
             *   The question key (API key) to select.
             */
            var filterForQuestion = function(submissions) {
              // Create a map of the responses, where key:response and value:quantity.
              $scope.data = {};
              _(submissions)
                .map('data.' + $scope.question)
                .value()
                .forEach(function(e) {
                  if (e) {
                    $scope.data[e] = $scope.data[e]+1 || 1;
                  }
                });
            };

            /**
             * Make the display for the answer choices.
             */
            var makeDisplay = function() {
              // Build the answer display.
              $scope.questionElementForm.html($compile(
                '<h3 class="fio-question-output">Answered: <span class="fio-question-answer">{{submission.data[question] || "N/A"}}</span></h3><br>' +
                makeGraph()
              )($scope));
            };

            // If the submissions were provided, use them rather than querying the api.
            if ($scope.submissions) {
              filterForQuestion($scope.submissions);
              makeDisplay();
            }
            // The submissions were not given, but the form url was; query the api url.
            else if (!$scope.submissions && $scope.src) {
              $http.get($scope.src + '/submission?limit=4294967295')
                .then(function(data) {
                  filterForQuestion(data.data);
                  makeDisplay();
                })
                .catch(function(err) {
                  console.error(err);
                });
            }
          };

          /**
           * Show the currently configured question, in the formio-question-form element.
           */
          $scope.showQuestion = function() {
            $scope.view = $scope.views.question;
            $scope.questionLoaded = true;
            $scope.formioAlerts = [];

            if (_.get($scope, 'submission.data.' + $scope.question) && !$scope.updateAnswer) {
              return $scope.showAnalytics();
            }

            var pageElement = angular.element(document.createElement('formio'));
            //angular.element(document.getElementsByClassName('formio-question-form'))
            angular.element($scope.questionElementForm)
              .html($compile(pageElement.attr({
                form: 'page',
                submission: 'submission'
              }))($scope));
          };

          /**
           * Reset the current question view, and return the questionElement contents to the pristine state.
           */
          $scope.resetQuestion = function() {
            $scope.questionElementForm.html($compile(formioQuestionTemplate)($scope));
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

          // If a promise was given to wait on, then wait before accessing the dom.
          var promises = [];
          if ($scope.waitForPromise) {
            promises.unshift($scope.waitForPromise);
          }

          // Watch the chart type to change the graph.
          $scope.$watch('chart', function(newVal, oldVal) {
            if (newVal !== oldVal) {
              $scope.showAnalytics();
            }
          });

          $q.all(promises)
            .then(function() {
              return $timeout(function() {
                // Check if the form was given, if provided, dont query the api.
                if ($scope.form) {
                  return $scope.form;
                }
                // No cached form was provided, use the given form url to query the api.
                else if ($scope.src) {
                  return $http.get($scope.src)
                    .then(function(data) {
                      return data.data;
                    })
                    .catch(function(err) {
                      console.error(err);
                    });
                }
              })
            })
            .then(function(form) {
              $scope.page = {
                components: [FormioUtils.getComponent(form.components, $scope.question)]
              };

              $scope.showQuestion();
            });
        }
      ]
    };
  });
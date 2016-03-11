angular.module('formio.question', ['formio', 'nvd3'])
  .directive('formioQuestion', function() {
    var formioQuestionTemplate =
      '<div class="formio-question-form"></div>' +
      '<button ng-if="previewResults && (view === \'question\')" class="btn btn-success btn-sm" ng-click="showAnalytics()">Results</button>' +
      '<button ng-if="updateAnswer && (view === \'analytics\')" class="btn btn-success btn-sm" ng-click="resetQuestion()">Question</button>' +
      '<button ng-if="view === \'question\'" class="btn btn-primary btn-sm pull-right" ng-click="save()" ng-disabled="disabledInput">Submit</button>';

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
        child: '=',
        form: '=',
        submissions: '=',
        submission: '=',
        previewResults: '=',
        updateAnswer: '=',
        chart: '=',
        chartAdvanced: '=',
        chartDataCustomizer: '=',
        waitForPromise: '=',
        disabledInput: '=',
        controller: '='
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
          var types = ['table', 'pie', 'word cloud', 'list'];
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

          var makeWordCloud = function() {
            var total = _($scope.data)
              .map('value')
              .value();
            total = _.sum(total);

            $scope.graphCallback = function(then) {
              var node = $scope.questionElementForm.find('#wordcloud')[0];
              var fill = d3.scale.category20();
              var layout = d3.layout.cloud()
                .size([400, 400])
                .words($scope.data.map(function(d) {
                  return {text: d.label.toString(), size: ((d.value/total) * 150)};
                }))
                .padding(5)
                .rotate(function() { return ~~(Math.random() * 2) * 90; })
                .font('Impact')
                .fontSize(function(d) { return d.size; })
                .on('end', draw);
              layout.start();

              function draw(words) {
                d3.select(node).append('svg')
                  .attr('width', layout.size()[0])
                  .attr('height', layout.size()[1])
                  .append('g')
                  .attr('transform', 'translate(' + layout.size()[0] / 2 + ',' + layout.size()[1] / 2 + ')')
                  .selectAll('text')
                  .data(words)
                  .enter().append('text')
                  .style('font-size', function(d) { return d.size + 'px'; })
                  .style('font-family', 'Impact')
                  .style('fill', function(d, i) { return fill(i); })
                  .attr('text-anchor', 'middle')
                  .attr('transform', function(d) {
                    return 'translate(' + [d.x, d.y] + ')rotate(' + d.rotate + ')';
                  })
                  .text(function(d) { return d.text; });
                then();
              };
            };

            return '<div id="wordcloud"></div>'
          };

          var makeList = function() {
            return '<div class="row">' +
              '<div class="col-md-12">' +
                '<h3>Results</h3>' +
                '<table class="table table-hover table-condensed">' +
                  '<thead>' +
                    '<tr>' +
                      '<th>Answer</th>' +
                      '<th>Time</th>' +
                    '</tr>' +
                  '</thead>' +
                  '<tbody>' +
                    '<tr ng-repeat="answer in data track by $index">' +
                      '<td>{{answer.value}}</td>' +
                      '<td>{{answer.created}}</td>' +
                    '</tr>' +
                  '</tbody>' +
                '</table>' +
              '</div>' +
            '</div>';
          };

          /**
           * Takes the common q/a result format and mutates it for graphing use in d3.
           *
           *
           * @returns {*}
           */
          var normalizeData = function(type, data) {
            data = data || $scope.data;

            if (['table', 'word cloud'].indexOf(type) !== -1) {
              return _(data)
                .map(function(value, key) {
                  return {
                    label: key,
                    value: value
                  };
                })
                .value();
            }
            else if (['list'].indexOf(type) !== -1) {
              return _(data)
                .orderBy('created', 'desc')
                .map(function(submission) {
                  return {
                    question: submission.data.key,
                    value: submission.data.value,
                    created: new Date(submission.created || 0).toString()
                  };
                })
                .value();
            }
            else if (['pie'].indexOf(type) !== -1) {
              return _(data)
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
           * @param {Array} submissions
           *   All the submissions for the current lesson.
           *
           * @returns {string}
           */
          var makeGraph = function(submissions) {
            /**
             * Using all the submission data, filter it for the specific question, and return the metrics.
             *
             * @param {Array} submissions
             *   All the submissions for the current lesson.
             */
            var countUniqueAnswers = function(submissions) {
              // Create a map of the responses, where key:response and value:quantity.
              $scope.data = {};

              // If the child key is present, use that for the answer display.
              var questionKey = ($scope.child || $scope.question);

              _(submissions)
                .map('data.' + questionKey)
                .value()
                .forEach(function(e) {
                  if (e) {
                    $scope.data[e] = $scope.data[e]+1 || 1;
                  }
                });

              return $scope.data;
            };

            /**
             * Filter the submission objects to contain the only applicable answer, while retaining submission data.
             *
             * @param {Array} submissions
             *   All the submissions for the current lesson.
             */
            var filterQuestion = function(submissions) {
              // If the child key is present, use that for the answer display.
              var questionKey = ($scope.child || $scope.question);

              $scope.data = _(submissions)
                .map(function(submission) {
                  if (_.has(submission, 'data.' + questionKey)) {
                    submission.data = {
                      key: questionKey,
                      value: _.get(submission, 'data.' + questionKey)
                    };

                    return submission;
                  }
                })
                .value();

              return $scope.data;
            };

            // Check for advanced usage.
            if ($scope.chartAdvanced &&_.get($scope.chartAdvanced, 'chart.type') && $scope.chartDataCustomizer) {
              // Make a nvd3 chart with the advanced options and mutate the data with the customizer.
              $scope.data = $scope.chartDataCustomizer($scope.data);
              return '<nvd3 options="chartAdvanced" data="data"></nvd3>'
            }

            // Determine the chart type.
            var chart = ($scope.chart || 'table').toString().toLowerCase();
            if (types.indexOf(chart) === -1) {
              console.error('Unknown type given: ' + chart);
            }

            if (chart === 'table') {
              $scope.data = normalizeData(chart, countUniqueAnswers(submissions));
              return makeTable();
            }
            else if (chart === 'word cloud') {
              $scope.data = normalizeData(chart, countUniqueAnswers(submissions));
              return makeWordCloud();
            }
            else if (chart === 'list') {
              $scope.data = normalizeData(chart, filterQuestion(submissions));
              return makeList();
            }
            else if (chart === 'pie') {
              $scope.data = normalizeData(chart, countUniqueAnswers(submissions));
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
             * Make the display for the answer choices.
             */
            var makeDisplay = function(submissions) {
              // Build the answer display.
              $scope.questionElementForm.html($compile(
                '<h3 class="fio-question-output">Answered: <span class="fio-question-answer">{{submission.data[(child || question)] || "N/A"}}</span></h3><br>' +
                makeGraph(submissions)
              )($scope));

              // if a graph callback was set, execute it before continuing
              if ($scope.graphCallback) {
                $scope.graphCallback(function() {
                  $scope.graphCallback = null;
                });
              }
            };

            // If the submissions were provided, use them rather than querying the api.
            if ($scope.useSubmissionCache && $scope.submissions) {
              //filterForQuestion();
              makeDisplay($scope.submissions);
              $scope.$emit('showAnalytics');
            }
            // The submissions were not given, but the form url was; query the api url.
            else if ($scope.src) {
              $scope.useSubmissionCache = true;
              $http.get($scope.src + '/submission?limit=4294967295')
                .then(function(data) {
                  //filterForQuestion();
                  makeDisplay(data.data);
                  $scope.$emit('showAnalytics');
                })
                .catch(function(err) {
                  console.error(err);
                });
            }
          };

          // Expose the showAnalytics function outside the directive if a controller was given.
          if ($scope.controller) {
            $scope.controller.showAnalytics = $scope.showAnalytics;
          }

          /**
           * Show the currently configured question, in the formio-question-form element.
           */
          $scope.showQuestion = function() {
            $scope.view = $scope.views.question;
            $scope.questionLoaded = true;
            $scope.formioAlerts = [];

            if (_.get($scope, 'submission.data.' + ($scope.child || $scope.question)) && !$scope.updateAnswer) {
              return $scope.showAnalytics();
            }

            var pageElement = angular.element(document.createElement('formio'));
            angular.element($scope.questionElementForm)
              .html($compile(pageElement.attr({
                form: 'page',
                submission: 'submission'
              }))($scope));
            $scope.$emit('showQuestion');
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
              .then(function(response) {
                $scope.$emit('questionSave', response);
                $scope.useSubmissionCache = false;
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

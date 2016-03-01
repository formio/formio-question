'use strict';

module.exports = function(gulp, plugins) {
  return function() {
    return plugins.browserify({
        entries: './src/question-complete.js'
      })
      .bundle()
      .pipe(plugins.source('question-complete.js'))
      .pipe(gulp.dest('dist/'))
      .pipe(plugins.rename('question-complete.min.js'))
      .pipe(plugins.streamify(plugins.uglify()))
      .pipe(gulp.dest('dist/'));
  };
};

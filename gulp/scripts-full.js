'use strict';

module.exports = function(gulp, plugins) {
  return function() {
    return plugins.browserify({
        entries: './src/question-full.js'
      })
      .bundle()
      .pipe(plugins.source('question-full.js'))
      .pipe(gulp.dest('dist/'))
      .pipe(plugins.rename('question-full.min.js'))
      .pipe(plugins.streamify(plugins.uglify()))
      .pipe(gulp.dest('dist/'));
  };
};

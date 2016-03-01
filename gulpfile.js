var gulp = require('gulp');
var plugins = require('gulp-load-plugins')();

plugins.source = require('vinyl-source-stream');
plugins.browserify = require('browserify');
plugins.watchify = require('watchify');

// Clean the dist folder.
gulp.task('clean', require('del').bind(null, ['dist']));

// Scripts tasks.
gulp.task('scripts:basic', require('./gulp/scripts-basic')(gulp, plugins));
gulp.task('scripts:complete', require('./gulp/scripts-complete')(gulp, plugins));
gulp.task('scripts:full', require('./gulp/scripts-full')(gulp, plugins));
gulp.task('scripts', ['scripts:basic', 'scripts:complete', 'scripts:full']);

// Define the build task.
gulp.task('build', ['clean', 'scripts']);

// Watch task for changes.
gulp.task('watch', require('./gulp/watch')(gulp, plugins));

// Default
gulp.task('default', ['build']);

var gulp = require('gulp'),
    browserify = require('browserify'),
    streamify = require('gulp-streamify'),
    source = require('vinyl-source-stream'),
    rename = require('gulp-rename'),
    connect = require('gulp-connect'),
    uglify = require('gulp-uglify');

gulp.task('connect', function () {

  connect.server();

});

gulp.task('bundle', function () {

  return browserify('./lib/browser.js')
    .bundle()
    .pipe(source('mirador.js'))
    .pipe(gulp.dest('./'))
    .pipe(streamify(uglify()))
    .pipe(rename(function (path) {
      path.extname = '.min.js';
    }))
    .pipe(gulp.dest('./'))
    .pipe(connect.reload());

});

gulp.task('default', ['connect', 'bundle']);

// an implementation of async.map since that's all we 
// use in the async library anyway; trying to reduce load 
// for browser
var _ = require('underscore'); // we're already using this anyway

function async_each(arr, iterator, cb) {

  if (!arr.length)
    return cb();

  var completed = 0;

  function done(err) {

    if (err) {
      cb(err);
      cb = function(){};
    }
    else {
      completed += 1;

      if (completed >= arr.length)
          return cb();

    }

  }

  _.each(arr, function (x) {
    iterator(x, _.once(done));
  });

}

module.exports = {

  // a very basic version of async.map;
  map: function (calls, iterator, done) {

    var indexed = _.map(calls, function (fnx, idx) {

      return { index: idx, value: fnx };

    });

    var results = [];
    async_each(indexed, function (x, cb) {

      iterator(x.value, function (err, v) {

        results[x.index] = v;

        // advance async_each
        cb(err);

      });

    }, function (err) {
      done(err, results);
    });


  },


};

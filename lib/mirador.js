var m_ = require('./util.js'),
    async = require('async'),
    _ = require('underscore'),

    // current api base @pre-ssl
    API_BASE = 'http://api.mirador.im/v1',
    request = require('superagent');


// very flexible input wrapper;
// lets the user input single obj, list, list of obj,
// all ending in a function/cb
function reqWrapper(dataType, fn, ctx) {

  return function () {
    ctx = ctx || this;

    var args = m_.splattedBlock(_.toArray(arguments)),
        done = args[1];
    var reqs = m_.buildRequestList(args[0]);

    reqs.serialize(dataType, function (err, calls) {

      async.map(calls, function (keys, cb) {
        fn.call(ctx, err, keys, cb);
      },

      function (errors, outputs) {

        if (errors)
          return done(errors, outputs);

        // have to have some smart logic in combining chunks;
        // need to establish a universal count
        var output = {}, idx = 0;

        _.each(outputs, function (out) {

          _.each(out, function (r, id) {
            output[id] = r;
            idx++;
          });

        });

        Object.defineProperty(output, 'size', {

          value: idx,
          enumerable: false,
          writable: false,

        });

        done(errors, output);
      });

    });
  }

}

function MiradorClient(apikey) {
  this.apikey = apikey;
}


function miradorRequest (err, params, done) {

  if (err)
    return done(err, null);

  request
    .post(API_BASE + '/classify')
    .type('form')
    .set('Accept', 'application/json')
    .send({ api_key: this.apikey })
    .send(params)
    .end(function (err, res) {

      if (err ||  !res.ok) {
        return done((err || res.status), res);
      }

      if (!res.body.results) {
        return done({ errors: "invalid response", code: 500 }, res);
      }

      // parse the results
      done(null, MiradorResponse.parse(res.body.results));
    });
}


MiradorClient.prototype = {


  classifyUrls: reqWrapper('url', miradorRequest),

  classifyFiles: reqWrapper('image', miradorRequest),

  classifyBuffers: reqWrapper('buffer', miradorRequest),

};

// alias & deprecation
MiradorClient.prototype.classifyRaw = MiradorClient.prototype.classifyBuffers;


function MiradorResponse(raw, idx) {

  if (!raw || raw.errors) {
    raw = (raw || {});

    this.id = raw.id;
    this.errors = raw.errors || 'Error in response';

    return;
  }

  this.id = (raw.id || raw.url) || idx;
  this.value = raw.result.value;
  this.safe = raw.result.safe;

}

//@static function
MiradorResponse.parse = function (results) {

  var output = {}, keyed = false;

  _.each(results, function (el, idx) {

    var res = new MiradorResponse(el, idx);

    // more basic test; if it's not a digit
    if (/^\d+$/.test(res.id)) {

      keyed = true;

      res.id = parseInt(res.id);
      output[parseInt(res.id)] = res;

    }

    else {

      output[res.id] = res;

    }

  });

  return output;
}

// just export the client
module.exports = {
  MiradorClient: MiradorClient
};

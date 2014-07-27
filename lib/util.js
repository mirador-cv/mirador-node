var async = require('async');
var _ = require('underscore');
var fs = require('fs');


function MiradorRequestList(items) {
  this._data = items && items.length ? (items) : [];
}

MiradorRequestList.prototype = {

  // TODO: this can be larger probably
  chunk_size: 4,

  _processors: {

    'url': function (item, done) {

      done(null, item);

    },

    'image': function (item, done) {

      this._processImage(item.data, function (err, data) {

        if (err || !data)
          return done(err, data);

        // pass on the result
        done(null, {
          id: item.id,
          data: data
        });

      });

    },

    'buffer': function (item, done) {

      done(null, {
        id: item.id,
        data: this._formatBuffer(item.data)
      });

    },

  },

  serialize: function (dataType, done) {
    var self = this;

    async.map(this._data, this._processors[dataType].bind(this), function (errors, res) {

      if (errors || !res || !res.length)
        return done(errors, res);

      // now we have an array of formatted output; 
      // turn this into the proper output
      var chunk = {}, idx = 0, output = [];

      _.each(res, function (r, i) {

        if (idx == self.chunk_size) {

          output.push(chunk);
          chunk = {};
          idx = 0;


        }

        var k = self._itemKeys(dataType, idx);

        chunk[k.id] = r.id;
        chunk[k.data] = r.data;

        idx++;
      });

      if (!_.isEmpty(chunk)) {
        output.push(chunk);
      }

      done(null, output);
    });

  },

  _processImage: function (filename, done) {
    var self = this;

    fs.readFile(filename, function (err, data) {

      if (err) {
        return done(err, null);
      }

      // base64-encode the output
      done(null, self._formatBuffer(data));
    });

  },

  _formatBuffer: function (buffer) {
    return buffer.toString('base64').replace("\n", '');
  },

  _itemKeys: function (t, idx) {
    t = t === 'buffer' ? 'image' : t;
    var base = t + '[' + idx + ']';

    return {
      id: base + '[id]',
      data: base + '[data]'
    }

  },

  add: function (id, data) {

    this._data.push({
      id: id,
      data: data
    });

  },

  length: function () {
    return this._data.length;
  }

};


function smartMapper (list) {

  if (_.isObject(list) && list.id && list.data) {
    return [list];
  }

  if (_.isArray(list)) {

    if (_.isArray(list[0])) {
      // recurse if we've got a nested list;
      // only deal with the first argument tho
      return smartMapper(list[0]);
    }

    return _.map(list, function (el, idx) {

      if (_.isString(el)) {
        return {
          id: el,
          data: el
        };
      }

      else if (_.isObject(el) && _.has(el, 'id') && _.has(el, 'data')) {
        return el;
      }

      else {
        return {
          id: idx,
          data: el
        };
      }


    });
  }

  if (_.isObject(list)) {

    return _.map(list, function (data, id) {

      return {
        id: id,
        data: data
      };

    });

  }

  throw "invalid input: " + list;
}


// for composition; accepts a list with a function at the end
function splattedBlock(args) {

  if (!_.isFunction(args[args.length - 1])) {
    throw "invalid input: last argument must be a callback!";
  }

  var fn = args.pop();
  return [args, fn];
}

function buildRequestList(data) {
  return new MiradorRequestList(smartMapper(data));
}


module.exports = {

  MiradorRequestList: MiradorRequestList,

  buildRequestList: buildRequestList,
  splattedBlock: splattedBlock,

};

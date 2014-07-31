var util = require('./util'),
    _ = require('underscore'),
    uu = require('util'),
    events = require('events'),
    mir = require('./mirador'),
    easyXDM = require('easyxdm').easyXDM,
    MiradorClient = mir.MiradorClient,
    miradorRequest = mir.miradorRequest,
    MiradorResponse = mir.MiradorResponse,

    REMOTE_PROXY = 'http://test.mirador.im:8080/static/xdm.html',
    reqWrapper = mir.reqWrapper;


function formatDataUri(uri) {
  return uri.substring(
    uri.indexOf(';base64,') + 8
  ).replace("\n", '');
}

function browserRequest(err, params, done) {

  if (!this.apikey || !this.authorized) {
    throw "unauthorized";
  }

  // proxy through the
  this.xdm.ajax({
    data: params,
  }, function (data) {
    done(null, MiradorResponse.parse(data.results));
  }, function (err) {
    done(err, null);
  });

}


_.extend(util.MiradorRequestList.prototype._processors, {

  field: function (item, done) {
    if (!item || !item.id) return done(item, null);

    var reader = new window.FileReader();

    reader.onload = function (e) {
      var url = e.target.result;

      done(null, {

        id: item.id,
        data: formatDataUri(url)

      });

    };


    // read the file
    reader.readAsDataURL(item.data); 
  },

  datauri: function (item, done) {
    if (!item || !item.data) return done(item, null);

    done(null, {

      id: item.id,
      data: formatDataUri(item.data),

    });

  },

  canvas: function (item, done) {
    if (!item || !item.data) return done(item, null);

    done(null, {

      id: item.id,
      data: formatDataUri(item.data.toDataURL()),

    });

  },

});


function MiradorBrowserClient(ak, ready) {

  if (this._inst[ak] && this._inst[ak].authorized) {
    var client = this._inst[ak];

    ready.call(client, client);
    return client;
  }

  this.xdm = new easyXDM.Rpc({
    remote: REMOTE_PROXY,
  }, {

    remote: {
      ajax: {},
      authorize: {},
    }

  });

  this.apikey = ak;

  var self = this;
  this.xdm.authorize(this.apikey, function (err, res) {

    if (!err) {
      self.authorized = true;
      self.onready(self);
      self._inst[self.apikey] = self;

    } else {
      throw "unauthorized: " + self.apikey + " for domain";
    }

  });

  this.onready = ready;
}

uu.inherits(MiradorBrowserClient, MiradorClient);

_.extend(MiradorBrowserClient.prototype, {

  _inst: {},

  classifyFiles: reqWrapper('field', browserRequest),
  classifyDataUri: reqWrapper('datauri', browserRequest),
  classifyCanvas: reqWrapper('canvas', browserRequest),
  classifyUrls: reqWrapper('url', browserRequest),


});


module.exports = {

  MiradorClient: MiradorBrowserClient,

};

// attach it to the mirador window
window.mirador = (window.mirador || {});
window.mirador.MiradorClient = MiradorBrowserClient;

// if jquery is here, make a plugin
if (window.jQuery) {
  window.jQuery.fn.mirador = function (apikey, options) {
    var self = this,
        defaultSelector = 'input[type="file"]';

    if (this.prop('tagName') === 'INPUT' && /file/i.test(this.attr('type'))) {
      defaultSelector = null;
    }

    var opt = $.extend({

      // when the API has an error
      errorEvent: 'mirador.error',

      // result 
      resultEvent: 'mirador.result',

      // when the client is authenticated
      readyEvent: 'mirador.ready',

      // bind to the result
      selector: defaultSelector,

      bindTo: 'change',

    }, options);

    function jqcallWrapper(fn, $el, ctx) {

      return function () {
        var args = _.toArray(arguments);

        var original = function (){};
        if (_.isFunction(args[args.length - 1])) {
          original = args.pop();
        }

        args.push(function (err, results) {

          if (results) {
            $el.trigger(opt.resultEvent, results);
          }

          if (err) {
            $el.trigger(opt.errorEvent, err);
          }

          original.call(this, err, results);
        });

        fn.apply(ctx, args);
      }
    }

    function onfieldchange (e) {
      var files = e.target.files;

      if (!files || !files.length) return;

      this.classifyFiles(files, function (err, results) {

        if (err) {
          self.trigger(opt.errorEvent, err);
        }

        else {
          self.trigger(opt.resultEvent, results);
        }

      });

    }

    function onclient (c) {

      self.trigger(opt.readyEvent, c);

      if (opt.selector) {
        self.on(opt.bindTo, opt.selector, onfieldchange.bind(c));
      }
      else if (opt.selector === null) {
        self.on(opt.bindTo, onfieldchange.bind(c));
      }

    }


    (this._miradorclient = new window.mirador.MiradorClient(apikey, onclient));

    return window.jQuery.mirador = ({

      classifyUrls: jqcallWrapper(this._miradorclient.classifyUrls, this, this._miradorclient),
      classifyFiles: jqcallWrapper(this._miradorclient.classifyFiles, this, this._miradorclient),
      classifyCanvas: jqcallWrapper(this._miradorclient.classifyCanvas, this, this._miradorclient),
      classifyDataUri: jqcallWrapper(this._miradorclient.classifyDataUri, this, this._miradorclient),

      client: this._miradorclient,

    });

  }
}


var util = require('./util'),
    _ = require('underscore'),
    uu = require('util'),
    events = require('events'),
    mir = require('./mirador'),
    easyXDM = require('easyxdm').easyXDM,
    MiradorClient = mir.MiradorClient,
    miradorRequest = mir.miradorRequest,
    MiradorResponse = mir.MiradorResponse,

    REMOTE_PROXY = 'http://api.mirador.im/xdm',

    // create a new one
    xdmRpc = new easyXDM.Rpc({
      remote: REMOTE_PROXY,
    }, {

      remote: {
        ajax: {},
        authorize: {},
      }

    }),
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

    if (err.message && err.message.responseText != null) {
      var er = {};

      try {

        er = JSON.parse(err.message.responseText);

      } catch (e) { er = {}};

      er.status = err.message.status;
      done(er, null);
    }
    else {
      done(err, null);
    }
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

// customevent polyfill;
// from https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent
(function () {
  function CustomEvent ( event, params ) {
    params = params || { bubbles: false, cancelable: false, detail: undefined };
    var evt = document.createEvent( 'CustomEvent' );
    evt.initCustomEvent( event, params.bubbles, params.cancelable, params.detail );
    return evt;
   };

  CustomEvent.prototype = window.Event.prototype;

  window.CustomEvent = CustomEvent;
})();

// fire a custom ready event
function fire(evt, target, payload) {

  var ev = new CustomEvent(evt, {
    bubbles: true,
    detail: payload
  });

  target.dispatchEvent(ev);
}


function MiradorBrowserClient(ak, ready, error) {

  if (this === window) {
    return new MiradorBrowserClient(ak, ready);
  }

  // ready is an optional function
  ready = ready || function(){};

  if (this._inst[ak] && this._inst[ak].authorized) {
    var client = this._inst[ak];

    ready.call(client, client);
    return client;
  }

  this.xdm = xdmRpc;
  this.apikey = ak;

  var self = this;
  this.xdm.authorize(this.apikey, function (data) {

    self.authorized = true;
    self.onready(self);
    self._inst[self.apikey] = self;

    // fire ready on document
    fire('mirador.login', window.document, self);


  }, function (err) {

    fire('mirador.error', window.document, { error: "unauthorized" });

    if (self.onerror && _.isFunction(self.onerror))
      self.onerror.call(self, "unauthorized: " + err);

  });


  this.onready = ready;
  this.onerror = error || function (err) { throw err; };
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

window.MiradorClient = MiradorBrowserClient;

// set up the mirador async init;
// window.mirador should already be a function from when we load it,
// if it is, append client as attribute and then call the function
// w/ our client

// now, every time we get it, make it the client
window.mirador = function (ak, cb, err) {
  new MiradorBrowserClient(ak, cb, err);
};


fire('mirador.ready', document, window.mirador.MiradorClient);
_.each(window.mirador_fnx, function (args) {
  args = _.toArray(args);
  if (args.length < 2 || !_.isFunction(args[1])) return;
  new MiradorBrowserClient(args[0], args[1], args[2]);
});



// if jquery is here, make a plugin
if (window.jQuery) {

  window.jQuery.fn.mirador = function (apikey, options, done) {

    if (_.isFunction(options) && done == null) {
      done = options;
      options = {};
    }

    var self = this,
        defaultSelector = 'input[type="file"]';

    if (this.prop('tagName') === 'INPUT' && /file/i.test(this.attr('type'))) {
      defaultSelector = 'self';
    }

    var opt = $.extend({

      // when the API has an error
      errorEvent: 'mirador.error',

      // result 
      resultEvent: 'mirador.result',

      // when the client is loaded
      readyEvent: 'mirador.ready',

      // when client is authorized
      loginEvent: 'mirador.login',

      classificationEvent: 'mirador.classification',

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

        $el.trigger(opt.classificationEvent, fn.name, args);
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

    function onclientjquery (cb) {

      return function (c) {
        var jqx = new MiradorJqueryClient(c, self);

        self.trigger(opt.loginEvent, jqx);

        if (opt.selector) {
          self.on(opt.bindTo, opt.selector, onfieldchange.bind(jqx));
        }
        else if (opt.selector === 'self') {
          self.on(opt.bindTo, onfieldchange.bind(jqx));
        }

        cb(jqx, c);
      }

    }

    function MiradorJqueryClient(c, el) {
      this.client = c;
      this._el = el;

      var self = this;

      _.each( [
          'classifyUrls', 'classifyFiles',
          'classifyCanvas', 'classifyBuffers',
          'classifyDataUri'
      ], function (fname) {
        el.mirador[fname] = self[fname] = jqcallWrapper(c[fname], el, c);
      });

      return this;
    }

    // this will give us the jquery client in the done() callback,
    // which should be passed in
    new MiradorBrowserClient(apikey, onclientjquery(done));

  }

  // when jquery is ready, then just treat it like everything else;
  // deliver the client to the browser on the 'document' object
  window.jQuery(function () {
    window.jQuery.mirador = $(document).mirador;

    _.each(window.mirador_jnx, function (x) {
      var args = _.toArray(x);
      $(document).mirador(args[0], args[1], args[2]);
    });

  });
}


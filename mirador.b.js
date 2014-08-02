(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{"underscore":7}],2:[function(require,module,exports){
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


},{"./mirador":4,"./util":5,"easyxdm":6,"events":8,"underscore":7,"util":12}],3:[function(require,module,exports){
module.exports = {

  readFile: function () {

    throw "cannot read file in browser";

  },

  readFileAsync: function () {

    throw "cannot read async in browser";

  },

}

},{}],4:[function(require,module,exports){
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

  classifyBare: reqWrapper('bare', miradorRequest),

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

  // for new version etc
  this.breast = raw.result['breast4'];
  this.penis = raw.result['penis4'];
  this.vagina = raw.result['vagina4'];
  this.butt = raw.result['butt4'];

}

//@static function
MiradorResponse.parse = function (results) {

  var output = {}, keyed = false;

  _.each(results, function (el, idx) {

    var res = new MiradorResponse(el, idx);

    // more basic test; if it's not a digit
    if (/^\d+$/.test(res.id)) {

      keyed = true;
      output[(res.id = parseInt(res.id))] = res;

    }

    else {

      output[res.id] = res;

    }

  });

  return output;
}

// just export the client
module.exports = {
  MiradorClient: MiradorClient,
  reqWrapper: reqWrapper,
  miradorRequest: miradorRequest,
  MiradorResponse: MiradorResponse,
};

},{"./util.js":5,"async":1,"superagent":3,"underscore":7}],5:[function(require,module,exports){
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

  _typeMap: {

    'buffer': 'image',
    'field': 'image',
    'raw': 'image',
    'canvas': 'image',

  },

  _itemKeys: function (t, idx) {
    t = this._typeMap[t] ? this._typeMap[t] : t;

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

    else if (list[0].toString() === '[object FileList]') {
      // flatten it out, v simple
      var output = [];
      _.each(list, function (filelist) {

        _.each(filelist, function (file) {

          output.push({ id: file.name, data: file });
        });

      });

      return output;
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

        var id = el.id != null ? el.id : (el.name != null ? el.name : idx);

        return {
          id: id,
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

  if (!_.isArray(data) && data.length) {
    data = _.toArray(data);
  }

  return new MiradorRequestList(smartMapper(data));
}


module.exports = {

  MiradorRequestList: MiradorRequestList,

  buildRequestList: buildRequestList,
  splattedBlock: splattedBlock,

};

},{"async":1,"fs":3,"underscore":7}],6:[function(require,module,exports){
/**
 * easyXDM
 * http://easyxdm.net/
 * Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
(function (window, document, location, setTimeout, decodeURIComponent, encodeURIComponent) {
/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global JSON, XMLHttpRequest, window, escape, unescape, ActiveXObject */
//
// easyXDM
// http://easyxdm.net/
// Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

var global = this;
var channelId = Math.floor(Math.random() * 10000); // randomize the initial id in case of multiple closures loaded 
var emptyFn = Function.prototype;
var reURI = /^((http.?:)\/\/([^:\/\s]+)(:\d+)*)/; // returns groups for protocol (2), domain (3) and port (4) 
var reParent = /[\-\w]+\/\.\.\//; // matches a foo/../ expression 
var reDoubleSlash = /([^:])\/\//g; // matches // anywhere but in the protocol
var namespace = ""; // stores namespace under which easyXDM object is stored on the page (empty if object is global)
var easyXDM = {};
var _easyXDM = window.easyXDM; // map over global easyXDM in case of overwrite
var IFRAME_PREFIX = "easyXDM_";
var HAS_NAME_PROPERTY_BUG;
var useHash = false; // whether to use the hash over the query
var flashVersion; // will be set if using flash
var HAS_FLASH_THROTTLED_BUG;


// http://peter.michaux.ca/articles/feature-detection-state-of-the-art-browser-scripting
function isHostMethod(object, property){
    var t = typeof object[property];
    return t == 'function' ||
    (!!(t == 'object' && object[property])) ||
    t == 'unknown';
}

function isHostObject(object, property){
    return !!(typeof(object[property]) == 'object' && object[property]);
}

// end

// http://perfectionkills.com/instanceof-considered-harmful-or-how-to-write-a-robust-isarray/
function isArray(o){
    return Object.prototype.toString.call(o) === '[object Array]';
}

// end
function hasFlash(){
    var name = "Shockwave Flash", mimeType = "application/x-shockwave-flash";
    
    if (!undef(navigator.plugins) && typeof navigator.plugins[name] == "object") {
        // adapted from the swfobject code
        var description = navigator.plugins[name].description;
        if (description && !undef(navigator.mimeTypes) && navigator.mimeTypes[mimeType] && navigator.mimeTypes[mimeType].enabledPlugin) {
            flashVersion = description.match(/\d+/g);
        }
    }
    if (!flashVersion) {
        var flash;
        try {
            flash = new ActiveXObject("ShockwaveFlash.ShockwaveFlash");
            flashVersion = Array.prototype.slice.call(flash.GetVariable("$version").match(/(\d+),(\d+),(\d+),(\d+)/), 1);
            flash = null;
        } 
        catch (notSupportedException) {
        }
    }
    if (!flashVersion) {
        return false;
    }
    var major = parseInt(flashVersion[0], 10), minor = parseInt(flashVersion[1], 10);
    HAS_FLASH_THROTTLED_BUG = major > 9 && minor > 0;
    return true;
}

/*
 * Cross Browser implementation for adding and removing event listeners.
 */
var on, un;
if (isHostMethod(window, "addEventListener")) {
    on = function(target, type, listener){
        target.addEventListener(type, listener, false);
    };
    un = function(target, type, listener){
        target.removeEventListener(type, listener, false);
    };
}
else if (isHostMethod(window, "attachEvent")) {
    on = function(object, sEvent, fpNotify){
        object.attachEvent("on" + sEvent, fpNotify);
    };
    un = function(object, sEvent, fpNotify){
        object.detachEvent("on" + sEvent, fpNotify);
    };
}
else {
    throw new Error("Browser not supported");
}

/*
 * Cross Browser implementation of DOMContentLoaded.
 */
var domIsReady = false, domReadyQueue = [], readyState;
if ("readyState" in document) {
    // If browser is WebKit-powered, check for both 'loaded' (legacy browsers) and
    // 'interactive' (HTML5 specs, recent WebKit builds) states.
    // https://bugs.webkit.org/show_bug.cgi?id=45119
    readyState = document.readyState;
    domIsReady = readyState == "complete" || (~ navigator.userAgent.indexOf('AppleWebKit/') && (readyState == "loaded" || readyState == "interactive"));
}
else {
    // If readyState is not supported in the browser, then in order to be able to fire whenReady functions apropriately
    // when added dynamically _after_ DOM load, we have to deduce wether the DOM is ready or not.
    // We only need a body to add elements to, so the existence of document.body is enough for us.
    domIsReady = !!document.body;
}

function dom_onReady(){
    if (domIsReady) {
        return;
    }
    domIsReady = true;
    for (var i = 0; i < domReadyQueue.length; i++) {
        domReadyQueue[i]();
    }
    domReadyQueue.length = 0;
}


if (!domIsReady) {
    if (isHostMethod(window, "addEventListener")) {
        on(document, "DOMContentLoaded", dom_onReady);
    }
    else {
        on(document, "readystatechange", function(){
            if (document.readyState == "complete") {
                dom_onReady();
            }
        });
        if (document.documentElement.doScroll && window === top) {
            var doScrollCheck = function(){
                if (domIsReady) {
                    return;
                }
                // http://javascript.nwbox.com/IEContentLoaded/
                try {
                    document.documentElement.doScroll("left");
                } 
                catch (e) {
                    setTimeout(doScrollCheck, 1);
                    return;
                }
                dom_onReady();
            };
            doScrollCheck();
        }
    }
    
    // A fallback to window.onload, that will always work
    on(window, "load", dom_onReady);
}
/**
 * This will add a function to the queue of functions to be run once the DOM reaches a ready state.
 * If functions are added after this event then they will be executed immediately.
 * @param {function} fn The function to add
 * @param {Object} scope An optional scope for the function to be called with.
 */
function whenReady(fn, scope){
    if (domIsReady) {
        fn.call(scope);
        return;
    }
    domReadyQueue.push(function(){
        fn.call(scope);
    });
}

/**
 * Returns an instance of easyXDM from the parent window with
 * respect to the namespace.
 *
 * @return An instance of easyXDM (in the parent window)
 */
function getParentObject(){
    var obj = parent;
    if (namespace !== "") {
        for (var i = 0, ii = namespace.split("."); i < ii.length; i++) {
            obj = obj[ii[i]];
        }
    }
    return obj.easyXDM;
}

/**
 * Removes easyXDM variable from the global scope. It also returns control
 * of the easyXDM variable to whatever code used it before.
 *
 * @param {String} ns A string representation of an object that will hold
 *                    an instance of easyXDM.
 * @return An instance of easyXDM
 */
function noConflict(ns){
    
    window.easyXDM = _easyXDM;
    namespace = ns;
    if (namespace) {
        IFRAME_PREFIX = "easyXDM_" + namespace.replace(".", "_") + "_";
    }
    return easyXDM;
}

/*
 * Methods for working with URLs
 */
/**
 * Get the domain name from a url.
 * @param {String} url The url to extract the domain from.
 * @return The domain part of the url.
 * @type {String}
 */
function getDomainName(url){
    return url.match(reURI)[3];
}

/**
 * Get the port for a given URL, or "" if none
 * @param {String} url The url to extract the port from.
 * @return The port part of the url.
 * @type {String}
 */
function getPort(url){
    return url.match(reURI)[4] || "";
}

/**
 * Returns  a string containing the schema, domain and if present the port
 * @param {String} url The url to extract the location from
 * @return {String} The location part of the url
 */
function getLocation(url){
    var m = url.toLowerCase().match(reURI);
    var proto = m[2], domain = m[3], port = m[4] || "";
    if ((proto == "http:" && port == ":80") || (proto == "https:" && port == ":443")) {
        port = "";
    }
    return proto + "//" + domain + port;
}

/**
 * Resolves a relative url into an absolute one.
 * @param {String} url The path to resolve.
 * @return {String} The resolved url.
 */
function resolveUrl(url){
    
    // replace all // except the one in proto with /
    url = url.replace(reDoubleSlash, "$1/");
    
    // If the url is a valid url we do nothing
    if (!url.match(/^(http||https):\/\//)) {
        // If this is a relative path
        var path = (url.substring(0, 1) === "/") ? "" : location.pathname;
        if (path.substring(path.length - 1) !== "/") {
            path = path.substring(0, path.lastIndexOf("/") + 1);
        }
        
        url = location.protocol + "//" + location.host + path + url;
    }
    
    // reduce all 'xyz/../' to just '' 
    while (reParent.test(url)) {
        url = url.replace(reParent, "");
    }
    
    return url;
}

/**
 * Appends the parameters to the given url.<br/>
 * The base url can contain existing query parameters.
 * @param {String} url The base url.
 * @param {Object} parameters The parameters to add.
 * @return {String} A new valid url with the parameters appended.
 */
function appendQueryParameters(url, parameters){
    
    var hash = "", indexOf = url.indexOf("#");
    if (indexOf !== -1) {
        hash = url.substring(indexOf);
        url = url.substring(0, indexOf);
    }
    var q = [];
    for (var key in parameters) {
        if (parameters.hasOwnProperty(key)) {
            q.push(key + "=" + encodeURIComponent(parameters[key]));
        }
    }
    return url + (useHash ? "#" : (url.indexOf("?") == -1 ? "?" : "&")) + q.join("&") + hash;
}


// build the query object either from location.query, if it contains the xdm_e argument, or from location.hash
var query = (function(input){
    input = input.substring(1).split("&");
    var data = {}, pair, i = input.length;
    while (i--) {
        pair = input[i].split("=");
        data[pair[0]] = decodeURIComponent(pair[1]);
    }
    return data;
}(/xdm_e=/.test(location.search) ? location.search : location.hash));

/*
 * Helper methods
 */
/**
 * Helper for checking if a variable/property is undefined
 * @param {Object} v The variable to test
 * @return {Boolean} True if the passed variable is undefined
 */
function undef(v){
    return typeof v === "undefined";
}

/**
 * A safe implementation of HTML5 JSON. Feature testing is used to make sure the implementation works.
 * @return {JSON} A valid JSON conforming object, or null if not found.
 */
var getJSON = function(){
    var cached = {};
    var obj = {
        a: [1, 2, 3]
    }, json = "{\"a\":[1,2,3]}";
    
    if (typeof JSON != "undefined" && typeof JSON.stringify === "function" && JSON.stringify(obj).replace((/\s/g), "") === json) {
        // this is a working JSON instance
        return JSON;
    }
    if (Object.toJSON) {
        if (Object.toJSON(obj).replace((/\s/g), "") === json) {
            // this is a working stringify method
            cached.stringify = Object.toJSON;
        }
    }
    
    if (typeof String.prototype.evalJSON === "function") {
        obj = json.evalJSON();
        if (obj.a && obj.a.length === 3 && obj.a[2] === 3) {
            // this is a working parse method           
            cached.parse = function(str){
                return str.evalJSON();
            };
        }
    }
    
    if (cached.stringify && cached.parse) {
        // Only memoize the result if we have valid instance
        getJSON = function(){
            return cached;
        };
        return cached;
    }
    return null;
};

/**
 * Applies properties from the source object to the target object.<br/>
 * @param {Object} target The target of the properties.
 * @param {Object} source The source of the properties.
 * @param {Boolean} noOverwrite Set to True to only set non-existing properties.
 */
function apply(destination, source, noOverwrite){
    var member;
    for (var prop in source) {
        if (source.hasOwnProperty(prop)) {
            if (prop in destination) {
                member = source[prop];
                if (typeof member === "object") {
                    apply(destination[prop], member, noOverwrite);
                }
                else if (!noOverwrite) {
                    destination[prop] = source[prop];
                }
            }
            else {
                destination[prop] = source[prop];
            }
        }
    }
    return destination;
}

// This tests for the bug in IE where setting the [name] property using javascript causes the value to be redirected into [submitName].
function testForNamePropertyBug(){
    var form = document.body.appendChild(document.createElement("form")), input = form.appendChild(document.createElement("input"));
    input.name = IFRAME_PREFIX + "TEST" + channelId; // append channelId in order to avoid caching issues
    HAS_NAME_PROPERTY_BUG = input !== form.elements[input.name];
    document.body.removeChild(form);
}

/**
 * Creates a frame and appends it to the DOM.
 * @param config {object} This object can have the following properties
 * <ul>
 * <li> {object} prop The properties that should be set on the frame. This should include the 'src' property.</li>
 * <li> {object} attr The attributes that should be set on the frame.</li>
 * <li> {DOMElement} container Its parent element (Optional).</li>
 * <li> {function} onLoad A method that should be called with the frames contentWindow as argument when the frame is fully loaded. (Optional)</li>
 * </ul>
 * @return The frames DOMElement
 * @type DOMElement
 */
function createFrame(config){
    if (undef(HAS_NAME_PROPERTY_BUG)) {
        testForNamePropertyBug();
    }
    var frame;
    // This is to work around the problems in IE6/7 with setting the name property. 
    // Internally this is set as 'submitName' instead when using 'iframe.name = ...'
    // This is not required by easyXDM itself, but is to facilitate other use cases 
    if (HAS_NAME_PROPERTY_BUG) {
        frame = document.createElement("<iframe name=\"" + config.props.name + "\"/>");
    }
    else {
        frame = document.createElement("IFRAME");
        frame.name = config.props.name;
    }
    
    frame.id = frame.name = config.props.name;
    delete config.props.name;
    
    if (typeof config.container == "string") {
        config.container = document.getElementById(config.container);
    }
    
    if (!config.container) {
        // This needs to be hidden like this, simply setting display:none and the like will cause failures in some browsers.
        apply(frame.style, {
            position: "absolute",
            top: "-2000px",
            // Avoid potential horizontal scrollbar
            left: "0px"
        });
        config.container = document.body;
    }
    
    // HACK: IE cannot have the src attribute set when the frame is appended
    //       into the container, so we set it to "javascript:false" as a
    //       placeholder for now.  If we left the src undefined, it would
    //       instead default to "about:blank", which causes SSL mixed-content
    //       warnings in IE6 when on an SSL parent page.
    var src = config.props.src;
    config.props.src = "javascript:false";
    
    // transfer properties to the frame
    apply(frame, config.props);
    
    frame.border = frame.frameBorder = 0;
    frame.allowTransparency = true;
    config.container.appendChild(frame);
    
    if (config.onLoad) {
        on(frame, "load", config.onLoad);
    }
    
    // set the frame URL to the proper value (we previously set it to
    // "javascript:false" to work around the IE issue mentioned above)
    if(config.usePost) {
        var form = config.container.appendChild(document.createElement('form')), input;
        form.target = frame.name;
        form.action = src;
        form.method = 'POST';
        if (typeof(config.usePost) === 'object') {
            for (var i in config.usePost) {
                if (config.usePost.hasOwnProperty(i)) {
                    if (HAS_NAME_PROPERTY_BUG) {
                        input = document.createElement('<input name="' + i + '"/>');
                    } else {
                        input = document.createElement("INPUT");
                        input.name = i;
                    }
                    input.value = config.usePost[i];
                    form.appendChild(input);
                }
            }
        }
        form.submit();
        form.parentNode.removeChild(form);
    } else {
        frame.src = src;
    }
    config.props.src = src;
    
    return frame;
}

/**
 * Check whether a domain is allowed using an Access Control List.
 * The ACL can contain * and ? as wildcards, or can be regular expressions.
 * If regular expressions they need to begin with ^ and end with $.
 * @param {Array/String} acl The list of allowed domains
 * @param {String} domain The domain to test.
 * @return {Boolean} True if the domain is allowed, false if not.
 */
function checkAcl(acl, domain){
    // normalize into an array
    if (typeof acl == "string") {
        acl = [acl];
    }
    var re, i = acl.length;
    while (i--) {
        re = acl[i];
        re = new RegExp(re.substr(0, 1) == "^" ? re : ("^" + re.replace(/(\*)/g, ".$1").replace(/\?/g, ".") + "$"));
        if (re.test(domain)) {
            return true;
        }
    }
    return false;
}

/*
 * Functions related to stacks
 */
/**
 * Prepares an array of stack-elements suitable for the current configuration
 * @param {Object} config The Transports configuration. See easyXDM.Socket for more.
 * @return {Array} An array of stack-elements with the TransportElement at index 0.
 */
function prepareTransportStack(config){
    var protocol = config.protocol, stackEls;
    config.isHost = config.isHost || undef(query.xdm_p);
    useHash = config.hash || false;
    
    if (!config.props) {
        config.props = {};
    }
    if (!config.isHost) {
        config.channel = query.xdm_c.replace(/["'<>\\]/g, "");
        config.secret = query.xdm_s;
        config.remote = query.xdm_e.replace(/["'<>\\]/g, "");
        ;
        protocol = query.xdm_p;
        if (config.acl && !checkAcl(config.acl, config.remote)) {
            throw new Error("Access denied for " + config.remote);
        }
    }
    else {
        config.remote = resolveUrl(config.remote);
        config.channel = config.channel || "default" + channelId++;
        config.secret = Math.random().toString(16).substring(2);
        if (undef(protocol)) {
            if (getLocation(location.href) == getLocation(config.remote)) {
                /*
                 * Both documents has the same origin, lets use direct access.
                 */
                protocol = "4";
            }
            else if (isHostMethod(window, "postMessage") || isHostMethod(document, "postMessage")) {
                /*
                 * This is supported in IE8+, Firefox 3+, Opera 9+, Chrome 2+ and Safari 4+
                 */
                protocol = "1";
            }
            else if (config.swf && isHostMethod(window, "ActiveXObject") && hasFlash()) {
                /*
                 * The Flash transport superseedes the NixTransport as the NixTransport has been blocked by MS
                 */
                protocol = "6";
            }
            else if (navigator.product === "Gecko" && "frameElement" in window && navigator.userAgent.indexOf('WebKit') == -1) {
                /*
                 * This is supported in Gecko (Firefox 1+)
                 */
                protocol = "5";
            }
            else if (config.remoteHelper) {
                /*
                 * This is supported in all browsers that retains the value of window.name when
                 * navigating from one domain to another, and where parent.frames[foo] can be used
                 * to get access to a frame from the same domain
                 */
                protocol = "2";
            }
            else {
                /*
                 * This is supported in all browsers where [window].location is writable for all
                 * The resize event will be used if resize is supported and the iframe is not put
                 * into a container, else polling will be used.
                 */
                protocol = "0";
            }
        }
    }
    config.protocol = protocol; // for conditional branching
    switch (protocol) {
        case "0":// 0 = HashTransport
            apply(config, {
                interval: 100,
                delay: 2000,
                useResize: true,
                useParent: false,
                usePolling: false
            }, true);
            if (config.isHost) {
                if (!config.local) {
                    // If no local is set then we need to find an image hosted on the current domain
                    var domain = location.protocol + "//" + location.host, images = document.body.getElementsByTagName("img"), image;
                    var i = images.length;
                    while (i--) {
                        image = images[i];
                        if (image.src.substring(0, domain.length) === domain) {
                            config.local = image.src;
                            break;
                        }
                    }
                    if (!config.local) {
                        // If no local was set, and we are unable to find a suitable file, then we resort to using the current window 
                        config.local = window;
                    }
                }
                
                var parameters = {
                    xdm_c: config.channel,
                    xdm_p: 0
                };
                
                if (config.local === window) {
                    // We are using the current window to listen to
                    config.usePolling = true;
                    config.useParent = true;
                    config.local = location.protocol + "//" + location.host + location.pathname + location.search;
                    parameters.xdm_e = config.local;
                    parameters.xdm_pa = 1; // use parent
                }
                else {
                    parameters.xdm_e = resolveUrl(config.local);
                }
                
                if (config.container) {
                    config.useResize = false;
                    parameters.xdm_po = 1; // use polling
                }
                config.remote = appendQueryParameters(config.remote, parameters);
            }
            else {
                apply(config, {
                    channel: query.xdm_c,
                    remote: query.xdm_e,
                    useParent: !undef(query.xdm_pa),
                    usePolling: !undef(query.xdm_po),
                    useResize: config.useParent ? false : config.useResize
                });
            }
            stackEls = [new easyXDM.stack.HashTransport(config), new easyXDM.stack.ReliableBehavior({}), new easyXDM.stack.QueueBehavior({
                encode: true,
                maxLength: 4000 - config.remote.length
            }), new easyXDM.stack.VerifyBehavior({
                initiate: config.isHost
            })];
            break;
        case "1":
            stackEls = [new easyXDM.stack.PostMessageTransport(config)];
            break;
        case "2":
            if (config.isHost) {
                config.remoteHelper = resolveUrl(config.remoteHelper);
            }
            stackEls = [new easyXDM.stack.NameTransport(config), new easyXDM.stack.QueueBehavior(), new easyXDM.stack.VerifyBehavior({
                initiate: config.isHost
            })];
            break;
        case "3":
            stackEls = [new easyXDM.stack.NixTransport(config)];
            break;
        case "4":
            stackEls = [new easyXDM.stack.SameOriginTransport(config)];
            break;
        case "5":
            stackEls = [new easyXDM.stack.FrameElementTransport(config)];
            break;
        case "6":
            if (!flashVersion) {
                hasFlash();
            }
            stackEls = [new easyXDM.stack.FlashTransport(config)];
            break;
    }
    // this behavior is responsible for buffering outgoing messages, and for performing lazy initialization
    stackEls.push(new easyXDM.stack.QueueBehavior({
        lazy: config.lazy,
        remove: true
    }));
    return stackEls;
}

/**
 * Chains all the separate stack elements into a single usable stack.<br/>
 * If an element is missing a necessary method then it will have a pass-through method applied.
 * @param {Array} stackElements An array of stack elements to be linked.
 * @return {easyXDM.stack.StackElement} The last element in the chain.
 */
function chainStack(stackElements){
    var stackEl, defaults = {
        incoming: function(message, origin){
            this.up.incoming(message, origin);
        },
        outgoing: function(message, recipient){
            this.down.outgoing(message, recipient);
        },
        callback: function(success){
            this.up.callback(success);
        },
        init: function(){
            this.down.init();
        },
        destroy: function(){
            this.down.destroy();
        }
    };
    for (var i = 0, len = stackElements.length; i < len; i++) {
        stackEl = stackElements[i];
        apply(stackEl, defaults, true);
        if (i !== 0) {
            stackEl.down = stackElements[i - 1];
        }
        if (i !== len - 1) {
            stackEl.up = stackElements[i + 1];
        }
    }
    return stackEl;
}

/**
 * This will remove a stackelement from its stack while leaving the stack functional.
 * @param {Object} element The elment to remove from the stack.
 */
function removeFromStack(element){
    element.up.down = element.down;
    element.down.up = element.up;
    element.up = element.down = null;
}

/*
 * Export the main object and any other methods applicable
 */
/** 
 * @class easyXDM
 * A javascript library providing cross-browser, cross-domain messaging/RPC.
 * @version 2.4.19.3
 * @singleton
 */
apply(easyXDM, {
    /**
     * The version of the library
     * @type {string}
     */
    version: "2.4.19.3",
    /**
     * This is a map containing all the query parameters passed to the document.
     * All the values has been decoded using decodeURIComponent.
     * @type {object}
     */
    query: query,
    /**
     * @private
     */
    stack: {},
    /**
     * Applies properties from the source object to the target object.<br/>
     * @param {object} target The target of the properties.
     * @param {object} source The source of the properties.
     * @param {boolean} noOverwrite Set to True to only set non-existing properties.
     */
    apply: apply,
    
    /**
     * A safe implementation of HTML5 JSON. Feature testing is used to make sure the implementation works.
     * @return {JSON} A valid JSON conforming object, or null if not found.
     */
    getJSONObject: getJSON,
    /**
     * This will add a function to the queue of functions to be run once the DOM reaches a ready state.
     * If functions are added after this event then they will be executed immediately.
     * @param {function} fn The function to add
     * @param {object} scope An optional scope for the function to be called with.
     */
    whenReady: whenReady,
    /**
     * Removes easyXDM variable from the global scope. It also returns control
     * of the easyXDM variable to whatever code used it before.
     *
     * @param {String} ns A string representation of an object that will hold
     *                    an instance of easyXDM.
     * @return An instance of easyXDM
     */
    noConflict: noConflict
});

/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global console, _FirebugCommandLine,  easyXDM, window, escape, unescape, isHostObject, undef, _trace, domIsReady, emptyFn, namespace */
//
// easyXDM
// http://easyxdm.net/
// Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global easyXDM, window, escape, unescape, isHostObject, isHostMethod, un, on, createFrame, debug */
//
// easyXDM
// http://easyxdm.net/
// Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

/** 
 * @class easyXDM.DomHelper
 * Contains methods for dealing with the DOM
 * @singleton
 */
easyXDM.DomHelper = {
    /**
     * Provides a consistent interface for adding eventhandlers
     * @param {Object} target The target to add the event to
     * @param {String} type The name of the event
     * @param {Function} listener The listener
     */
    on: on,
    /**
     * Provides a consistent interface for removing eventhandlers
     * @param {Object} target The target to remove the event from
     * @param {String} type The name of the event
     * @param {Function} listener The listener
     */
    un: un,
    /**
     * Checks for the presence of the JSON object.
     * If it is not present it will use the supplied path to load the JSON2 library.
     * This should be called in the documents head right after the easyXDM script tag.
     * http://json.org/json2.js
     * @param {String} path A valid path to json2.js
     */
    requiresJSON: function(path){
        if (!isHostObject(window, "JSON")) {
            // we need to encode the < in order to avoid an illegal token error
            // when the script is inlined in a document.
            document.write('<' + 'script type="text/javascript" src="' + path + '"><' + '/script>');
        }
    }
};
/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global easyXDM, window, escape, unescape, debug */
//
// easyXDM
// http://easyxdm.net/
// Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

(function(){
    // The map containing the stored functions
    var _map = {};
    
    /**
     * @class easyXDM.Fn
     * This contains methods related to function handling, such as storing callbacks.
     * @singleton
     * @namespace easyXDM
     */
    easyXDM.Fn = {
        /**
         * Stores a function using the given name for reference
         * @param {String} name The name that the function should be referred by
         * @param {Function} fn The function to store
         * @namespace easyXDM.fn
         */
        set: function(name, fn){
            _map[name] = fn;
        },
        /**
         * Retrieves the function referred to by the given name
         * @param {String} name The name of the function to retrieve
         * @param {Boolean} del If the function should be deleted after retrieval
         * @return {Function} The stored function
         * @namespace easyXDM.fn
         */
        get: function(name, del){
            if (!_map.hasOwnProperty(name)) {
                return;
            }
            var fn = _map[name];
            
            if (del) {
                delete _map[name];
            }
            return fn;
        }
    };
    
}());
/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global easyXDM, window, escape, unescape, chainStack, prepareTransportStack, getLocation, debug */
//
// easyXDM
// http://easyxdm.net/
// Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

/**
 * @class easyXDM.Socket
 * This class creates a transport channel between two domains that is usable for sending and receiving string-based messages.<br/>
 * The channel is reliable, supports queueing, and ensures that the message originates from the expected domain.<br/>
 * Internally different stacks will be used depending on the browsers features and the available parameters.
 * <h2>How to set up</h2>
 * Setting up the provider:
 * <pre><code>
 * var socket = new easyXDM.Socket({
 * &nbsp; local: "name.html",
 * &nbsp; onReady: function(){
 * &nbsp; &nbsp; &#47;&#47; you need to wait for the onReady callback before using the socket
 * &nbsp; &nbsp; socket.postMessage("foo-message");
 * &nbsp; },
 * &nbsp; onMessage: function(message, origin) {
 * &nbsp;&nbsp; alert("received " + message + " from " + origin);
 * &nbsp; }
 * });
 * </code></pre>
 * Setting up the consumer:
 * <pre><code>
 * var socket = new easyXDM.Socket({
 * &nbsp; remote: "http:&#47;&#47;remotedomain/page.html",
 * &nbsp; remoteHelper: "http:&#47;&#47;remotedomain/name.html",
 * &nbsp; onReady: function(){
 * &nbsp; &nbsp; &#47;&#47; you need to wait for the onReady callback before using the socket
 * &nbsp; &nbsp; socket.postMessage("foo-message");
 * &nbsp; },
 * &nbsp; onMessage: function(message, origin) {
 * &nbsp;&nbsp; alert("received " + message + " from " + origin);
 * &nbsp; }
 * });
 * </code></pre>
 * If you are unable to upload the <code>name.html</code> file to the consumers domain then remove the <code>remoteHelper</code> property
 * and easyXDM will fall back to using the HashTransport instead of the NameTransport when not able to use any of the primary transports.
 * @namespace easyXDM
 * @constructor
 * @cfg {String/Window} local The url to the local name.html document, a local static file, or a reference to the local window.
 * @cfg {Boolean} lazy (Consumer only) Set this to true if you want easyXDM to defer creating the transport until really needed. 
 * @cfg {String} remote (Consumer only) The url to the providers document.
 * @cfg {String} remoteHelper (Consumer only) The url to the remote name.html file. This is to support NameTransport as a fallback. Optional.
 * @cfg {Number} delay The number of milliseconds easyXDM should try to get a reference to the local window.  Optional, defaults to 2000.
 * @cfg {Number} interval The interval used when polling for messages. Optional, defaults to 300.
 * @cfg {String} channel (Consumer only) The name of the channel to use. Can be used to set consistent iframe names. Must be unique. Optional.
 * @cfg {Function} onMessage The method that should handle incoming messages.<br/> This method should accept two arguments, the message as a string, and the origin as a string. Optional.
 * @cfg {Function} onReady A method that should be called when the transport is ready. Optional.
 * @cfg {DOMElement|String} container (Consumer only) The element, or the id of the element that the primary iframe should be inserted into. If not set then the iframe will be positioned off-screen. Optional.
 * @cfg {Array/String} acl (Provider only) Here you can specify which '[protocol]://[domain]' patterns that should be allowed to act as the consumer towards this provider.<br/>
 * This can contain the wildcards ? and *.  Examples are 'http://example.com', '*.foo.com' and '*dom?.com'. If you want to use reqular expressions then you pattern needs to start with ^ and end with $.
 * If none of the patterns match an Error will be thrown.  
 * @cfg {Object} props (Consumer only) Additional properties that should be applied to the iframe. This can also contain nested objects e.g: <code>{style:{width:"100px", height:"100px"}}</code>. 
 * Properties such as 'name' and 'src' will be overrided. Optional.
 */
easyXDM.Socket = function(config){
    
    // create the stack
    var stack = chainStack(prepareTransportStack(config).concat([{
        incoming: function(message, origin){
            config.onMessage(message, origin);
        },
        callback: function(success){
            if (config.onReady) {
                config.onReady(success);
            }
        }
    }])), recipient = getLocation(config.remote);
    
    // set the origin
    this.origin = getLocation(config.remote);
	
    /**
     * Initiates the destruction of the stack.
     */
    this.destroy = function(){
        stack.destroy();
    };
    
    /**
     * Posts a message to the remote end of the channel
     * @param {String} message The message to send
     */
    this.postMessage = function(message){
        stack.outgoing(message, recipient);
    };
    
    stack.init();
};
/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global easyXDM, window, escape, unescape, undef,, chainStack, prepareTransportStack, debug, getLocation */
//
// easyXDM
// http://easyxdm.net/
// Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

/** 
 * @class easyXDM.Rpc
 * Creates a proxy object that can be used to call methods implemented on the remote end of the channel, and also to provide the implementation
 * of methods to be called from the remote end.<br/>
 * The instantiated object will have methods matching those specified in <code>config.remote</code>.<br/>
 * This requires the JSON object present in the document, either natively, using json.org's json2 or as a wrapper around library spesific methods.
 * <h2>How to set up</h2>
 * <pre><code>
 * var rpc = new easyXDM.Rpc({
 * &nbsp; &#47;&#47; this configuration is equal to that used by the Socket.
 * &nbsp; remote: "http:&#47;&#47;remotedomain/...",
 * &nbsp; onReady: function(){
 * &nbsp; &nbsp; &#47;&#47; you need to wait for the onReady callback before using the proxy
 * &nbsp; &nbsp; rpc.foo(...
 * &nbsp; }
 * },{
 * &nbsp; local: {..},
 * &nbsp; remote: {..}
 * });
 * </code></pre>
 * 
 * <h2>Exposing functions (procedures)</h2>
 * <pre><code>
 * var rpc = new easyXDM.Rpc({
 * &nbsp; ...
 * },{
 * &nbsp; local: {
 * &nbsp; &nbsp; nameOfMethod: {
 * &nbsp; &nbsp; &nbsp; method: function(arg1, arg2, success, error){
 * &nbsp; &nbsp; &nbsp; &nbsp; ...
 * &nbsp; &nbsp; &nbsp; }
 * &nbsp; &nbsp; },
 * &nbsp; &nbsp; &#47;&#47; with shorthand notation 
 * &nbsp; &nbsp; nameOfAnotherMethod:  function(arg1, arg2, success, error){
 * &nbsp; &nbsp; }
 * &nbsp; },
 * &nbsp; remote: {...}
 * });
 * </code></pre>

 * The function referenced by  [method] will receive the passed arguments followed by the callback functions <code>success</code> and <code>error</code>.<br/>
 * To send a successfull result back you can use
 *     <pre><code>
 *     return foo;
 *     </pre></code>
 * or
 *     <pre><code>
 *     success(foo);
 *     </pre></code>
 *  To return an error you can use
 *     <pre><code>
 *     throw new Error("foo error");
 *     </code></pre>
 * or
 *     <pre><code>
 *     error("foo error");
 *     </code></pre>
 *
 * <h2>Defining remotely exposed methods (procedures/notifications)</h2>
 * The definition of the remote end is quite similar:
 * <pre><code>
 * var rpc = new easyXDM.Rpc({
 * &nbsp; ...
 * },{
 * &nbsp; local: {...},
 * &nbsp; remote: {
 * &nbsp; &nbsp; nameOfMethod: {}
 * &nbsp; }
 * });
 * </code></pre>
 * To call a remote method use
 * <pre><code>
 * rpc.nameOfMethod("arg1", "arg2", function(value) {
 * &nbsp; alert("success: " + value);
 * }, function(message) {
 * &nbsp; alert("error: " + message + );
 * });
 * </code></pre>
 * Both the <code>success</code> and <code>errror</code> callbacks are optional.<br/>
 * When called with no callback a JSON-RPC 2.0 notification will be executed.
 * Be aware that you will not be notified of any errors with this method.
 * <br/>
 * <h2>Specifying a custom serializer</h2>
 * If you do not want to use the JSON2 library for non-native JSON support, but instead capabilities provided by some other library
 * then you can specify a custom serializer using <code>serializer: foo</code>
 * <pre><code>
 * var rpc = new easyXDM.Rpc({
 * &nbsp; ...
 * },{
 * &nbsp; local: {...},
 * &nbsp; remote: {...},
 * &nbsp; serializer : {
 * &nbsp; &nbsp; parse: function(string){ ... },
 * &nbsp; &nbsp; stringify: function(object) {...}
 * &nbsp; }
 * });
 * </code></pre>
 * If <code>serializer</code> is set then the class will not attempt to use the native implementation.
 * @namespace easyXDM
 * @constructor
 * @param {Object} config The underlying transports configuration. See easyXDM.Socket for available parameters.
 * @param {Object} jsonRpcConfig The description of the interface to implement.
 */
easyXDM.Rpc = function(config, jsonRpcConfig){
    
    // expand shorthand notation
    if (jsonRpcConfig.local) {
        for (var method in jsonRpcConfig.local) {
            if (jsonRpcConfig.local.hasOwnProperty(method)) {
                var member = jsonRpcConfig.local[method];
                if (typeof member === "function") {
                    jsonRpcConfig.local[method] = {
                        method: member
                    };
                }
            }
        }
    }
	
    // create the stack
    var stack = chainStack(prepareTransportStack(config).concat([new easyXDM.stack.RpcBehavior(this, jsonRpcConfig), {
        callback: function(success){
            if (config.onReady) {
                config.onReady(success);
            }
        }
    }]));
	
    // set the origin 
    this.origin = getLocation(config.remote);
	
    
    /**
     * Initiates the destruction of the stack.
     */
    this.destroy = function(){
        stack.destroy();
    };
    
    stack.init();
};
/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global easyXDM, window, escape, unescape, getLocation, appendQueryParameters, createFrame, debug, un, on, apply, whenReady, getParentObject, IFRAME_PREFIX*/
//
// easyXDM
// http://easyxdm.net/
// Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

/**
 * @class easyXDM.stack.SameOriginTransport
 * SameOriginTransport is a transport class that can be used when both domains have the same origin.<br/>
 * This can be useful for testing and for when the main application supports both internal and external sources.
 * @namespace easyXDM.stack
 * @constructor
 * @param {Object} config The transports configuration.
 * @cfg {String} remote The remote document to communicate with.
 */
easyXDM.stack.SameOriginTransport = function(config){
    var pub, frame, send, targetOrigin;
    
    return (pub = {
        outgoing: function(message, domain, fn){
            send(message);
            if (fn) {
                fn();
            }
        },
        destroy: function(){
            if (frame) {
                frame.parentNode.removeChild(frame);
                frame = null;
            }
        },
        onDOMReady: function(){
            targetOrigin = getLocation(config.remote);
            
            if (config.isHost) {
                // set up the iframe
                apply(config.props, {
                    src: appendQueryParameters(config.remote, {
                        xdm_e: location.protocol + "//" + location.host + location.pathname,
                        xdm_c: config.channel,
                        xdm_p: 4 // 4 = SameOriginTransport
                    }),
                    name: IFRAME_PREFIX + config.channel + "_provider"
                });
                frame = createFrame(config);
                easyXDM.Fn.set(config.channel, function(sendFn){
                    send = sendFn;
                    setTimeout(function(){
                        pub.up.callback(true);
                    }, 0);
                    return function(msg){
                        pub.up.incoming(msg, targetOrigin);
                    };
                });
            }
            else {
                send = getParentObject().Fn.get(config.channel, true)(function(msg){
                    pub.up.incoming(msg, targetOrigin);
                });
                setTimeout(function(){
                    pub.up.callback(true);
                }, 0);
            }
        },
        init: function(){
            whenReady(pub.onDOMReady, pub);
        }
    });
};
/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global global, easyXDM, window, getLocation, appendQueryParameters, createFrame, debug, apply, whenReady, IFRAME_PREFIX, namespace, resolveUrl, getDomainName, HAS_FLASH_THROTTLED_BUG, getPort, query*/
//
// easyXDM
// http://easyxdm.net/
// Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

/**
 * @class easyXDM.stack.FlashTransport
 * FlashTransport is a transport class that uses an SWF with LocalConnection to pass messages back and forth.
 * @namespace easyXDM.stack
 * @constructor
 * @param {Object} config The transports configuration.
 * @cfg {String} remote The remote domain to communicate with.
 * @cfg {String} secret the pre-shared secret used to secure the communication.
 * @cfg {String} swf The path to the swf file
 * @cfg {Boolean} swfNoThrottle Set this to true if you want to take steps to avoid beeing throttled when hidden.
 * @cfg {String || DOMElement} swfContainer Set this if you want to control where the swf is placed
 */
easyXDM.stack.FlashTransport = function(config){
    var pub, // the public interface
 frame, send, targetOrigin, swf, swfContainer;
    
    function onMessage(message, origin){
        setTimeout(function(){
            pub.up.incoming(message, targetOrigin);
        }, 0);
    }
    
    /**
     * This method adds the SWF to the DOM and prepares the initialization of the channel
     */
    function addSwf(domain){
        // the differentiating query argument is needed in Flash9 to avoid a caching issue where LocalConnection would throw an error.
        var url = config.swf + "?host=" + config.isHost;
        var id = "easyXDM_swf_" + Math.floor(Math.random() * 10000);
        
        // prepare the init function that will fire once the swf is ready
        easyXDM.Fn.set("flash_loaded" + domain.replace(/[\-.]/g, "_"), function(){
            easyXDM.stack.FlashTransport[domain].swf = swf = swfContainer.firstChild;
            var queue = easyXDM.stack.FlashTransport[domain].queue;
            for (var i = 0; i < queue.length; i++) {
                queue[i]();
            }
            queue.length = 0;
        });
        
        if (config.swfContainer) {
            swfContainer = (typeof config.swfContainer == "string") ? document.getElementById(config.swfContainer) : config.swfContainer;
        }
        else {
            // create the container that will hold the swf
            swfContainer = document.createElement('div');
            
            // http://bugs.adobe.com/jira/browse/FP-4796
            // http://tech.groups.yahoo.com/group/flexcoders/message/162365
            // https://groups.google.com/forum/#!topic/easyxdm/mJZJhWagoLc
            apply(swfContainer.style, HAS_FLASH_THROTTLED_BUG && config.swfNoThrottle ? {
                height: "20px",
                width: "20px",
                position: "fixed",
                right: 0,
                top: 0
            } : {
                height: "1px",
                width: "1px",
                position: "absolute",
                overflow: "hidden",
                right: 0,
                top: 0
            });
            document.body.appendChild(swfContainer);
        }
        
        // create the object/embed
        var flashVars = "callback=flash_loaded" + encodeURIComponent(domain.replace(/[\-.]/g, "_"))
            + "&proto=" + global.location.protocol
            + "&domain=" + encodeURIComponent(getDomainName(global.location.href))
            + "&port=" + encodeURIComponent(getPort(global.location.href))
            + "&ns=" + encodeURIComponent(namespace);
        swfContainer.innerHTML = "<object height='20' width='20' type='application/x-shockwave-flash' id='" + id + "' data='" + url + "'>" +
        "<param name='allowScriptAccess' value='always'></param>" +
        "<param name='wmode' value='transparent'>" +
        "<param name='movie' value='" +
        url +
        "'></param>" +
        "<param name='flashvars' value='" +
        flashVars +
        "'></param>" +
        "<embed type='application/x-shockwave-flash' FlashVars='" +
        flashVars +
        "' allowScriptAccess='always' wmode='transparent' src='" +
        url +
        "' height='1' width='1'></embed>" +
        "</object>";
    }
    
    return (pub = {
        outgoing: function(message, domain, fn){
            swf.postMessage(config.channel, message.toString());
            if (fn) {
                fn();
            }
        },
        destroy: function(){
            try {
                swf.destroyChannel(config.channel);
            } 
            catch (e) {
            }
            swf = null;
            if (frame) {
                frame.parentNode.removeChild(frame);
                frame = null;
            }
        },
        onDOMReady: function(){
            
            targetOrigin = config.remote;
            
            // Prepare the code that will be run after the swf has been intialized
            easyXDM.Fn.set("flash_" + config.channel + "_init", function(){
                setTimeout(function(){
                    pub.up.callback(true);
                });
            });
            
            // set up the omMessage handler
            easyXDM.Fn.set("flash_" + config.channel + "_onMessage", onMessage);
            
            config.swf = resolveUrl(config.swf); // reports have been made of requests gone rogue when using relative paths
            var swfdomain = getDomainName(config.swf);
            var fn = function(){
                // set init to true in case the fn was called was invoked from a separate instance
                easyXDM.stack.FlashTransport[swfdomain].init = true;
                swf = easyXDM.stack.FlashTransport[swfdomain].swf;
                // create the channel
                swf.createChannel(config.channel, config.secret, getLocation(config.remote), config.isHost);
                
                if (config.isHost) {
                    // if Flash is going to be throttled and we want to avoid this
                    if (HAS_FLASH_THROTTLED_BUG && config.swfNoThrottle) {
                        apply(config.props, {
                            position: "fixed",
                            right: 0,
                            top: 0,
                            height: "20px",
                            width: "20px"
                        });
                    }
                    // set up the iframe
                    apply(config.props, {
                        src: appendQueryParameters(config.remote, {
                            xdm_e: getLocation(location.href),
                            xdm_c: config.channel,
                            xdm_p: 6, // 6 = FlashTransport
                            xdm_s: config.secret
                        }),
                        name: IFRAME_PREFIX + config.channel + "_provider"
                    });
                    frame = createFrame(config);
                }
            };
            
            if (easyXDM.stack.FlashTransport[swfdomain] && easyXDM.stack.FlashTransport[swfdomain].init) {
                // if the swf is in place and we are the consumer
                fn();
            }
            else {
                // if the swf does not yet exist
                if (!easyXDM.stack.FlashTransport[swfdomain]) {
                    // add the queue to hold the init fn's
                    easyXDM.stack.FlashTransport[swfdomain] = {
                        queue: [fn]
                    };
                    addSwf(swfdomain);
                }
                else {
                    easyXDM.stack.FlashTransport[swfdomain].queue.push(fn);
                }
            }
        },
        init: function(){
            whenReady(pub.onDOMReady, pub);
        }
    });
};
/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global easyXDM, window, escape, unescape, getLocation, appendQueryParameters, createFrame, debug, un, on, apply, whenReady, IFRAME_PREFIX*/
//
// easyXDM
// http://easyxdm.net/
// Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

/**
 * @class easyXDM.stack.PostMessageTransport
 * PostMessageTransport is a transport class that uses HTML5 postMessage for communication.<br/>
 * <a href="http://msdn.microsoft.com/en-us/library/ms644944(VS.85).aspx">http://msdn.microsoft.com/en-us/library/ms644944(VS.85).aspx</a><br/>
 * <a href="https://developer.mozilla.org/en/DOM/window.postMessage">https://developer.mozilla.org/en/DOM/window.postMessage</a>
 * @namespace easyXDM.stack
 * @constructor
 * @param {Object} config The transports configuration.
 * @cfg {String} remote The remote domain to communicate with.
 */
easyXDM.stack.PostMessageTransport = function(config){
    var pub, // the public interface
 frame, // the remote frame, if any
 callerWindow, // the window that we will call with
 targetOrigin; // the domain to communicate with
    /**
     * Resolves the origin from the event object
     * @private
     * @param {Object} event The messageevent
     * @return {String} The scheme, host and port of the origin
     */
    function _getOrigin(event){
        if (event.origin) {
            // This is the HTML5 property
            return getLocation(event.origin);
        }
        if (event.uri) {
            // From earlier implementations 
            return getLocation(event.uri);
        }
        if (event.domain) {
            // This is the last option and will fail if the 
            // origin is not using the same schema as we are
            return location.protocol + "//" + event.domain;
        }
        throw "Unable to retrieve the origin of the event";
    }
    
    /**
     * This is the main implementation for the onMessage event.<br/>
     * It checks the validity of the origin and passes the message on if appropriate.
     * @private
     * @param {Object} event The messageevent
     */
    function _window_onMessage(event){
        var origin = _getOrigin(event);
        if (origin == targetOrigin && event.data.substring(0, config.channel.length + 1) == config.channel + " ") {
            pub.up.incoming(event.data.substring(config.channel.length + 1), origin);
        }
    }
    
    return (pub = {
        outgoing: function(message, domain, fn){
            callerWindow.postMessage(config.channel + " " + message, domain || targetOrigin);
            if (fn) {
                fn();
            }
        },
        destroy: function(){
            un(window, "message", _window_onMessage);
            if (frame) {
                callerWindow = null;
                frame.parentNode.removeChild(frame);
                frame = null;
            }
        },
        onDOMReady: function(){
            targetOrigin = getLocation(config.remote);
            if (config.isHost) {
                // add the event handler for listening
                var waitForReady = function(event){  
                    if (event.data == config.channel + "-ready") {
                        // replace the eventlistener
                        callerWindow = ("postMessage" in frame.contentWindow) ? frame.contentWindow : frame.contentWindow.document;
                        un(window, "message", waitForReady);
                        on(window, "message", _window_onMessage);
                        setTimeout(function(){
                            pub.up.callback(true);
                        }, 0);
                    }
                };
                on(window, "message", waitForReady);
                
                // set up the iframe
                apply(config.props, {
                    src: appendQueryParameters(config.remote, {
                        xdm_e: getLocation(location.href),
                        xdm_c: config.channel,
                        xdm_p: 1 // 1 = PostMessage
                    }),
                    name: IFRAME_PREFIX + config.channel + "_provider"
                });
                frame = createFrame(config);
            }
            else {
                // add the event handler for listening
                on(window, "message", _window_onMessage);
                callerWindow = ("postMessage" in window.parent) ? window.parent : window.parent.document;
                callerWindow.postMessage(config.channel + "-ready", targetOrigin);
                
                setTimeout(function(){
                    pub.up.callback(true);
                }, 0);
            }
        },
        init: function(){
            whenReady(pub.onDOMReady, pub);
        }
    });
};
/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global easyXDM, window, escape, unescape, getLocation, appendQueryParameters, createFrame, debug, apply, query, whenReady, IFRAME_PREFIX*/
//
// easyXDM
// http://easyxdm.net/
// Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

/**
 * @class easyXDM.stack.FrameElementTransport
 * FrameElementTransport is a transport class that can be used with Gecko-browser as these allow passing variables using the frameElement property.<br/>
 * Security is maintained as Gecho uses Lexical Authorization to determine under which scope a function is running.
 * @namespace easyXDM.stack
 * @constructor
 * @param {Object} config The transports configuration.
 * @cfg {String} remote The remote document to communicate with.
 */
easyXDM.stack.FrameElementTransport = function(config){
    var pub, frame, send, targetOrigin;
    
    return (pub = {
        outgoing: function(message, domain, fn){
            send.call(this, message);
            if (fn) {
                fn();
            }
        },
        destroy: function(){
            if (frame) {
                frame.parentNode.removeChild(frame);
                frame = null;
            }
        },
        onDOMReady: function(){
            targetOrigin = getLocation(config.remote);
            
            if (config.isHost) {
                // set up the iframe
                apply(config.props, {
                    src: appendQueryParameters(config.remote, {
                        xdm_e: getLocation(location.href),
                        xdm_c: config.channel,
                        xdm_p: 5 // 5 = FrameElementTransport
                    }),
                    name: IFRAME_PREFIX + config.channel + "_provider"
                });
                frame = createFrame(config);
                frame.fn = function(sendFn){
                    delete frame.fn;
                    send = sendFn;
                    setTimeout(function(){
                        pub.up.callback(true);
                    }, 0);
                    // remove the function so that it cannot be used to overwrite the send function later on
                    return function(msg){
                        pub.up.incoming(msg, targetOrigin);
                    };
                };
            }
            else {
                // This is to mitigate origin-spoofing
                if (document.referrer && getLocation(document.referrer) != query.xdm_e) {
                    window.top.location = query.xdm_e;
                }
                send = window.frameElement.fn(function(msg){
                    pub.up.incoming(msg, targetOrigin);
                });
                pub.up.callback(true);
            }
        },
        init: function(){
            whenReady(pub.onDOMReady, pub);
        }
    });
};
/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global easyXDM, window, escape, unescape, undef, getLocation, appendQueryParameters, resolveUrl, createFrame, debug, un, apply, whenReady, IFRAME_PREFIX*/
//
// easyXDM
// http://easyxdm.net/
// Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

/**
 * @class easyXDM.stack.NameTransport
 * NameTransport uses the window.name property to relay data.
 * The <code>local</code> parameter needs to be set on both the consumer and provider,<br/>
 * and the <code>remoteHelper</code> parameter needs to be set on the consumer.
 * @constructor
 * @param {Object} config The transports configuration.
 * @cfg {String} remoteHelper The url to the remote instance of hash.html - this is only needed for the host.
 * @namespace easyXDM.stack
 */
easyXDM.stack.NameTransport = function(config){
    
    var pub; // the public interface
    var isHost, callerWindow, remoteWindow, readyCount, callback, remoteOrigin, remoteUrl;
    
    function _sendMessage(message){
        var url = config.remoteHelper + (isHost ? "#_3" : "#_2") + config.channel;
        callerWindow.contentWindow.sendMessage(message, url);
    }
    
    function _onReady(){
        if (isHost) {
            if (++readyCount === 2 || !isHost) {
                pub.up.callback(true);
            }
        }
        else {
            _sendMessage("ready");
            pub.up.callback(true);
        }
    }
    
    function _onMessage(message){
        pub.up.incoming(message, remoteOrigin);
    }
    
    function _onLoad(){
        if (callback) {
            setTimeout(function(){
                callback(true);
            }, 0);
        }
    }
    
    return (pub = {
        outgoing: function(message, domain, fn){
            callback = fn;
            _sendMessage(message);
        },
        destroy: function(){
            callerWindow.parentNode.removeChild(callerWindow);
            callerWindow = null;
            if (isHost) {
                remoteWindow.parentNode.removeChild(remoteWindow);
                remoteWindow = null;
            }
        },
        onDOMReady: function(){
            isHost = config.isHost;
            readyCount = 0;
            remoteOrigin = getLocation(config.remote);
            config.local = resolveUrl(config.local);
            
            if (isHost) {
                // Register the callback
                easyXDM.Fn.set(config.channel, function(message){
                    if (isHost && message === "ready") {
                        // Replace the handler
                        easyXDM.Fn.set(config.channel, _onMessage);
                        _onReady();
                    }
                });
                
                // Set up the frame that points to the remote instance
                remoteUrl = appendQueryParameters(config.remote, {
                    xdm_e: config.local,
                    xdm_c: config.channel,
                    xdm_p: 2
                });
                apply(config.props, {
                    src: remoteUrl + '#' + config.channel,
                    name: IFRAME_PREFIX + config.channel + "_provider"
                });
                remoteWindow = createFrame(config);
            }
            else {
                config.remoteHelper = config.remote;
                easyXDM.Fn.set(config.channel, _onMessage);
            }
            
            // Set up the iframe that will be used for the transport
            var onLoad = function(){
                // Remove the handler
                var w = callerWindow || this;
                un(w, "load", onLoad);
                easyXDM.Fn.set(config.channel + "_load", _onLoad);
                (function test(){
                    if (typeof w.contentWindow.sendMessage == "function") {
                        _onReady();
                    }
                    else {
                        setTimeout(test, 50);
                    }
                }());
            };
            
            callerWindow = createFrame({
                props: {
                    src: config.local + "#_4" + config.channel
                },
                onLoad: onLoad
            });
        },
        init: function(){
            whenReady(pub.onDOMReady, pub);
        }
    });
};
/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global easyXDM, window, escape, unescape, getLocation, createFrame, debug, un, on, apply, whenReady, IFRAME_PREFIX*/
//
// easyXDM
// http://easyxdm.net/
// Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

/**
 * @class easyXDM.stack.HashTransport
 * HashTransport is a transport class that uses the IFrame URL Technique for communication.<br/>
 * <a href="http://msdn.microsoft.com/en-us/library/bb735305.aspx">http://msdn.microsoft.com/en-us/library/bb735305.aspx</a><br/>
 * @namespace easyXDM.stack
 * @constructor
 * @param {Object} config The transports configuration.
 * @cfg {String/Window} local The url to the local file used for proxying messages, or the local window.
 * @cfg {Number} delay The number of milliseconds easyXDM should try to get a reference to the local window.
 * @cfg {Number} interval The interval used when polling for messages.
 */
easyXDM.stack.HashTransport = function(config){
    var pub;
    var me = this, isHost, _timer, pollInterval, _lastMsg, _msgNr, _listenerWindow, _callerWindow;
    var useParent, _remoteOrigin;
    
    function _sendMessage(message){
        if (!_callerWindow) {
            return;
        }
        var url = config.remote + "#" + (_msgNr++) + "_" + message;
        ((isHost || !useParent) ? _callerWindow.contentWindow : _callerWindow).location = url;
    }
    
    function _handleHash(hash){
        _lastMsg = hash;
        pub.up.incoming(_lastMsg.substring(_lastMsg.indexOf("_") + 1), _remoteOrigin);
    }
    
    /**
     * Checks location.hash for a new message and relays this to the receiver.
     * @private
     */
    function _pollHash(){
        if (!_listenerWindow) {
            return;
        }
        var href = _listenerWindow.location.href, hash = "", indexOf = href.indexOf("#");
        if (indexOf != -1) {
            hash = href.substring(indexOf);
        }
        if (hash && hash != _lastMsg) {
            _handleHash(hash);
        }
    }
    
    function _attachListeners(){
        _timer = setInterval(_pollHash, pollInterval);
    }
    
    return (pub = {
        outgoing: function(message, domain){
            _sendMessage(message);
        },
        destroy: function(){
            window.clearInterval(_timer);
            if (isHost || !useParent) {
                _callerWindow.parentNode.removeChild(_callerWindow);
            }
            _callerWindow = null;
        },
        onDOMReady: function(){
            isHost = config.isHost;
            pollInterval = config.interval;
            _lastMsg = "#" + config.channel;
            _msgNr = 0;
            useParent = config.useParent;
            _remoteOrigin = getLocation(config.remote);
            if (isHost) {
                apply(config.props, {
                    src: config.remote,
                    name: IFRAME_PREFIX + config.channel + "_provider"
                });
                if (useParent) {
                    config.onLoad = function(){
                        _listenerWindow = window;
                        _attachListeners();
                        pub.up.callback(true);
                    };
                }
                else {
                    var tries = 0, max = config.delay / 50;
                    (function getRef(){
                        if (++tries > max) {
                            throw new Error("Unable to reference listenerwindow");
                        }
                        try {
                            _listenerWindow = _callerWindow.contentWindow.frames[IFRAME_PREFIX + config.channel + "_consumer"];
                        } 
                        catch (ex) {
                        }
                        if (_listenerWindow) {
                            _attachListeners();
                            pub.up.callback(true);
                        }
                        else {
                            setTimeout(getRef, 50);
                        }
                    }());
                }
                _callerWindow = createFrame(config);
            }
            else {
                _listenerWindow = window;
                _attachListeners();
                if (useParent) {
                    _callerWindow = parent;
                    pub.up.callback(true);
                }
                else {
                    apply(config, {
                        props: {
                            src: config.remote + "#" + config.channel + new Date(),
                            name: IFRAME_PREFIX + config.channel + "_consumer"
                        },
                        onLoad: function(){
                            pub.up.callback(true);
                        }
                    });
                    _callerWindow = createFrame(config);
                }
            }
        },
        init: function(){
            whenReady(pub.onDOMReady, pub);
        }
    });
};
/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global easyXDM, window, escape, unescape, debug */
//
// easyXDM
// http://easyxdm.net/
// Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

/**
 * @class easyXDM.stack.ReliableBehavior
 * This is a behavior that tries to make the underlying transport reliable by using acknowledgements.
 * @namespace easyXDM.stack
 * @constructor
 * @param {Object} config The behaviors configuration.
 */
easyXDM.stack.ReliableBehavior = function(config){
    var pub, // the public interface
 callback; // the callback to execute when we have a confirmed success/failure
    var idOut = 0, idIn = 0, currentMessage = "";
    
    return (pub = {
        incoming: function(message, origin){
            var indexOf = message.indexOf("_"), ack = message.substring(0, indexOf).split(",");
            message = message.substring(indexOf + 1);
            
            if (ack[0] == idOut) {
                currentMessage = "";
                if (callback) {
                    callback(true);
                }
            }
            if (message.length > 0) {
                pub.down.outgoing(ack[1] + "," + idOut + "_" + currentMessage, origin);
                if (idIn != ack[1]) {
                    idIn = ack[1];
                    pub.up.incoming(message, origin);
                }
            }
            
        },
        outgoing: function(message, origin, fn){
            currentMessage = message;
            callback = fn;
            pub.down.outgoing(idIn + "," + (++idOut) + "_" + message, origin);
        }
    });
};
/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global easyXDM, window, escape, unescape, debug, undef, removeFromStack*/
//
// easyXDM
// http://easyxdm.net/
// Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

/**
 * @class easyXDM.stack.QueueBehavior
 * This is a behavior that enables queueing of messages. <br/>
 * It will buffer incoming messages and dispach these as fast as the underlying transport allows.
 * This will also fragment/defragment messages so that the outgoing message is never bigger than the
 * set length.
 * @namespace easyXDM.stack
 * @constructor
 * @param {Object} config The behaviors configuration. Optional.
 * @cfg {Number} maxLength The maximum length of each outgoing message. Set this to enable fragmentation.
 */
easyXDM.stack.QueueBehavior = function(config){
    var pub, queue = [], waiting = true, incoming = "", destroying, maxLength = 0, lazy = false, doFragment = false;
    
    function dispatch(){
        if (config.remove && queue.length === 0) {
            removeFromStack(pub);
            return;
        }
        if (waiting || queue.length === 0 || destroying) {
            return;
        }
        waiting = true;
        var message = queue.shift();
        
        pub.down.outgoing(message.data, message.origin, function(success){
            waiting = false;
            if (message.callback) {
                setTimeout(function(){
                    message.callback(success);
                }, 0);
            }
            dispatch();
        });
    }
    return (pub = {
        init: function(){
            if (undef(config)) {
                config = {};
            }
            if (config.maxLength) {
                maxLength = config.maxLength;
                doFragment = true;
            }
            if (config.lazy) {
                lazy = true;
            }
            else {
                pub.down.init();
            }
        },
        callback: function(success){
            waiting = false;
            var up = pub.up; // in case dispatch calls removeFromStack
            dispatch();
            up.callback(success);
        },
        incoming: function(message, origin){
            if (doFragment) {
                var indexOf = message.indexOf("_"), seq = parseInt(message.substring(0, indexOf), 10);
                incoming += message.substring(indexOf + 1);
                if (seq === 0) {
                    if (config.encode) {
                        incoming = decodeURIComponent(incoming);
                    }
                    pub.up.incoming(incoming, origin);
                    incoming = "";
                }
            }
            else {
                pub.up.incoming(message, origin);
            }
        },
        outgoing: function(message, origin, fn){
            if (config.encode) {
                message = encodeURIComponent(message);
            }
            var fragments = [], fragment;
            if (doFragment) {
                // fragment into chunks
                while (message.length !== 0) {
                    fragment = message.substring(0, maxLength);
                    message = message.substring(fragment.length);
                    fragments.push(fragment);
                }
                // enqueue the chunks
                while ((fragment = fragments.shift())) {
                    queue.push({
                        data: fragments.length + "_" + fragment,
                        origin: origin,
                        callback: fragments.length === 0 ? fn : null
                    });
                }
            }
            else {
                queue.push({
                    data: message,
                    origin: origin,
                    callback: fn
                });
            }
            if (lazy) {
                pub.down.init();
            }
            else {
                dispatch();
            }
        },
        destroy: function(){
            destroying = true;
            pub.down.destroy();
        }
    });
};
/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global easyXDM, window, escape, unescape, undef, debug */
//
// easyXDM
// http://easyxdm.net/
// Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

/**
 * @class easyXDM.stack.VerifyBehavior
 * This behavior will verify that communication with the remote end is possible, and will also sign all outgoing,
 * and verify all incoming messages. This removes the risk of someone hijacking the iframe to send malicious messages.
 * @namespace easyXDM.stack
 * @constructor
 * @param {Object} config The behaviors configuration.
 * @cfg {Boolean} initiate If the verification should be initiated from this end.
 */
easyXDM.stack.VerifyBehavior = function(config){
    var pub, mySecret, theirSecret, verified = false;
    
    function startVerification(){
        mySecret = Math.random().toString(16).substring(2);
        pub.down.outgoing(mySecret);
    }
    
    return (pub = {
        incoming: function(message, origin){
            var indexOf = message.indexOf("_");
            if (indexOf === -1) {
                if (message === mySecret) {
                    pub.up.callback(true);
                }
                else if (!theirSecret) {
                    theirSecret = message;
                    if (!config.initiate) {
                        startVerification();
                    }
                    pub.down.outgoing(message);
                }
            }
            else {
                if (message.substring(0, indexOf) === theirSecret) {
                    pub.up.incoming(message.substring(indexOf + 1), origin);
                }
            }
        },
        outgoing: function(message, origin, fn){
            pub.down.outgoing(mySecret + "_" + message, origin, fn);
        },
        callback: function(success){
            if (config.initiate) {
                startVerification();
            }
        }
    });
};
/*jslint evil: true, browser: true, immed: true, passfail: true, undef: true, newcap: true*/
/*global easyXDM, window, escape, unescape, undef, getJSON, debug, emptyFn, isArray */
//
// easyXDM
// http://easyxdm.net/
// Copyright(c) 2009-2011, Øyvind Sean Kinsey, oyvind@kinsey.no.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

/**
 * @class easyXDM.stack.RpcBehavior
 * This uses JSON-RPC 2.0 to expose local methods and to invoke remote methods and have responses returned over the the string based transport stack.<br/>
 * Exposed methods can return values synchronous, asyncronous, or bet set up to not return anything.
 * @namespace easyXDM.stack
 * @constructor
 * @param {Object} proxy The object to apply the methods to.
 * @param {Object} config The definition of the local and remote interface to implement.
 * @cfg {Object} local The local interface to expose.
 * @cfg {Object} remote The remote methods to expose through the proxy.
 * @cfg {Object} serializer The serializer to use for serializing and deserializing the JSON. Should be compatible with the HTML5 JSON object. Optional, will default to JSON.
 */
easyXDM.stack.RpcBehavior = function(proxy, config){
    var pub, serializer = config.serializer || getJSON();
    var _callbackCounter = 0, _callbacks = {};
    
    /**
     * Serializes and sends the message
     * @private
     * @param {Object} data The JSON-RPC message to be sent. The jsonrpc property will be added.
     */
    function _send(data){
        data.jsonrpc = "2.0";
        pub.down.outgoing(serializer.stringify(data));
    }
    
    /**
     * Creates a method that implements the given definition
     * @private
     * @param {Object} The method configuration
     * @param {String} method The name of the method
     * @return {Function} A stub capable of proxying the requested method call
     */
    function _createMethod(definition, method){
        var slice = Array.prototype.slice;
        
        return function(){
            var l = arguments.length, callback, message = {
                method: method
            };
            
            if (l > 0 && typeof arguments[l - 1] === "function") {
                //with callback, procedure
                if (l > 1 && typeof arguments[l - 2] === "function") {
                    // two callbacks, success and error
                    callback = {
                        success: arguments[l - 2],
                        error: arguments[l - 1]
                    };
                    message.params = slice.call(arguments, 0, l - 2);
                }
                else {
                    // single callback, success
                    callback = {
                        success: arguments[l - 1]
                    };
                    message.params = slice.call(arguments, 0, l - 1);
                }
                _callbacks["" + (++_callbackCounter)] = callback;
                message.id = _callbackCounter;
            }
            else {
                // no callbacks, a notification
                message.params = slice.call(arguments, 0);
            }
            if (definition.namedParams && message.params.length === 1) {
                message.params = message.params[0];
            }
            // Send the method request
            _send(message);
        };
    }
    
    /**
     * Executes the exposed method
     * @private
     * @param {String} method The name of the method
     * @param {Number} id The callback id to use
     * @param {Function} method The exposed implementation
     * @param {Array} params The parameters supplied by the remote end
     */
    function _executeMethod(method, id, fn, params){
        if (!fn) {
            if (id) {
                _send({
                    id: id,
                    error: {
                        code: -32601,
                        message: "Procedure not found."
                    }
                });
            }
            return;
        }
        
        var success, error;
        if (id) {
            success = function(result){
                success = emptyFn;
                _send({
                    id: id,
                    result: result
                });
            };
            error = function(message, data){
                error = emptyFn;
                var msg = {
                    id: id,
                    error: {
                        code: -32099,
                        message: message
                    }
                };
                if (data) {
                    msg.error.data = data;
                }
                _send(msg);
            };
        }
        else {
            success = error = emptyFn;
        }
        // Call local method
        if (!isArray(params)) {
            params = [params];
        }
        try {
            var result = fn.method.apply(fn.scope, params.concat([success, error]));
            if (!undef(result)) {
                success(result);
            }
        } 
        catch (ex1) {
            error(ex1.message);
        }
    }
    
    return (pub = {
        incoming: function(message, origin){
            var data = serializer.parse(message);
            if (data.method) {
                // A method call from the remote end
                if (config.handle) {
                    config.handle(data, _send);
                }
                else {
                    _executeMethod(data.method, data.id, config.local[data.method], data.params);
                }
            }
            else {
                // A method response from the other end
                var callback = _callbacks[data.id];
                if (data.error) {
                    if (callback.error) {
                        callback.error(data.error);
                    }
                }
                else if (callback.success) {
                    callback.success(data.result);
                }
                delete _callbacks[data.id];
            }
        },
        init: function(){
            if (config.remote) {
                // Implement the remote sides exposed methods
                for (var method in config.remote) {
                    if (config.remote.hasOwnProperty(method)) {
                        proxy[method] = _createMethod(config.remote[method], method);
                    }
                }
            }
            pub.down.init();
        },
        destroy: function(){
            for (var method in config.remote) {
                if (config.remote.hasOwnProperty(method) && proxy.hasOwnProperty(method)) {
                    delete proxy[method];
                }
            }
            pub.down.destroy();
        }
    });
};

global.easyXDM = easyXDM;
})(window, document, location, window.setTimeout, decodeURIComponent, encodeURIComponent);

if (module && module.exports !== undefined) {
  module.exports.easyXDM = window.easyXDM;
  window.easyXDM = undefined;
}

},{}],7:[function(require,module,exports){
//     Underscore.js 1.6.0
//     http://underscorejs.org
//     (c) 2009-2014 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `exports` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var
    push             = ArrayProto.push,
    slice            = ArrayProto.slice,
    concat           = ArrayProto.concat,
    toString         = ObjProto.toString,
    hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.6.0';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return obj;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, length = obj.length; i < length; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      var keys = _.keys(obj);
      for (var i = 0, length = keys.length; i < length; i++) {
        if (iterator.call(context, obj[keys[i]], keys[i], obj) === breaker) return;
      }
    }
    return obj;
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results.push(iterator.call(context, value, index, list));
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, predicate, context) {
    var result;
    any(obj, function(value, index, list) {
      if (predicate.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, predicate, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(predicate, context);
    each(obj, function(value, index, list) {
      if (predicate.call(context, value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, predicate, context) {
    return _.filter(obj, function(value, index, list) {
      return !predicate.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, predicate, context) {
    predicate || (predicate = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(predicate, context);
    each(obj, function(value, index, list) {
      if (!(result = result && predicate.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, predicate, context) {
    predicate || (predicate = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(predicate, context);
    each(obj, function(value, index, list) {
      if (result || (result = predicate.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      return (isFunc ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, _.property(key));
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs) {
    return _.filter(obj, _.matches(attrs));
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.find(obj, _.matches(attrs));
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See [WebKit Bug 80797](https://bugs.webkit.org/show_bug.cgi?id=80797)
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    var result = -Infinity, lastComputed = -Infinity;
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      if (computed > lastComputed) {
        result = value;
        lastComputed = computed;
      }
    });
    return result;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    var result = Infinity, lastComputed = Infinity;
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      if (computed < lastComputed) {
        result = value;
        lastComputed = computed;
      }
    });
    return result;
  };

  // Shuffle an array, using the modern version of the
  // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisher–Yates_shuffle).
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // Sample **n** random values from a collection.
  // If **n** is not specified, returns a single random element.
  // The internal `guard` argument allows it to work with `map`.
  _.sample = function(obj, n, guard) {
    if (n == null || guard) {
      if (obj.length !== +obj.length) obj = _.values(obj);
      return obj[_.random(obj.length - 1)];
    }
    return _.shuffle(obj).slice(0, Math.max(0, n));
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    if (value == null) return _.identity;
    if (_.isFunction(value)) return value;
    return _.property(value);
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, iterator, context) {
    iterator = lookupIterator(iterator);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value: value,
        index: index,
        criteria: iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index - right.index;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(behavior) {
    return function(obj, iterator, context) {
      var result = {};
      iterator = lookupIterator(iterator);
      each(obj, function(value, index) {
        var key = iterator.call(context, value, index, obj);
        behavior(result, key, value);
      });
      return result;
    };
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = group(function(result, key, value) {
    _.has(result, key) ? result[key].push(value) : result[key] = [value];
  });

  // Indexes the object's values by a criterion, similar to `groupBy`, but for
  // when you know that your index values will be unique.
  _.indexBy = group(function(result, key, value) {
    result[key] = value;
  });

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = group(function(result, key) {
    _.has(result, key) ? result[key]++ : result[key] = 1;
  });

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) return array[0];
    if (n < 0) return [];
    return slice.call(array, 0, n);
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) return array[array.length - 1];
    return slice.call(array, Math.max(array.length - n, 0));
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    if (shallow && _.every(input, _.isArray)) {
      return concat.apply(output, input);
    }
    each(input, function(value) {
      if (_.isArray(value) || _.isArguments(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Flatten out an array, either recursively (by default), or just one level.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Split an array into two arrays: one whose elements all satisfy the given
  // predicate, and one whose elements all do not satisfy the predicate.
  _.partition = function(array, predicate) {
    var pass = [], fail = [];
    each(array, function(elem) {
      (predicate(elem) ? pass : fail).push(elem);
    });
    return [pass, fail];
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.contains(other, item);
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var length = _.max(_.pluck(arguments, 'length').concat(0));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(arguments, '' + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, length = list.length; i < length; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, length = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, length + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < length; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(length);

    while(idx < length) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    var args, bound;
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      ctor.prototype = null;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context. _ acts
  // as a placeholder, allowing any combination of arguments to be pre-filled.
  _.partial = function(func) {
    var boundArgs = slice.call(arguments, 1);
    return function() {
      var position = 0;
      var args = boundArgs.slice();
      for (var i = 0, length = args.length; i < length; i++) {
        if (args[i] === _) args[i] = arguments[position++];
      }
      while (position < arguments.length) args.push(arguments[position++]);
      return func.apply(this, args);
    };
  };

  // Bind a number of an object's methods to that object. Remaining arguments
  // are the method names to be bound. Useful for ensuring that all callbacks
  // defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length === 0) throw new Error('bindAll must be passed function names');
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    options || (options = {});
    var later = function() {
      previous = options.leading === false ? 0 : _.now();
      timeout = null;
      result = func.apply(context, args);
      context = args = null;
    };
    return function() {
      var now = _.now();
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
        context = args = null;
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, args, context, timestamp, result;

    var later = function() {
      var last = _.now() - timestamp;
      if (last < wait) {
        timeout = setTimeout(later, wait - last);
      } else {
        timeout = null;
        if (!immediate) {
          result = func.apply(context, args);
          context = args = null;
        }
      }
    };

    return function() {
      context = this;
      args = arguments;
      timestamp = _.now();
      var callNow = immediate && !timeout;
      if (!timeout) {
        timeout = setTimeout(later, wait);
      }
      if (callNow) {
        result = func.apply(context, args);
        context = args = null;
      }

      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return _.partial(wrapper, func);
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = function(obj) {
    if (!_.isObject(obj)) return [];
    if (nativeKeys) return nativeKeys(obj);
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var values = new Array(length);
    for (var i = 0; i < length; i++) {
      values[i] = obj[keys[i]];
    }
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var pairs = new Array(length);
    for (var i = 0; i < length; i++) {
      pairs[i] = [keys[i], obj[keys[i]]];
    }
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    var keys = _.keys(obj);
    for (var i = 0, length = keys.length; i < length; i++) {
      result[obj[keys[i]]] = keys[i];
    }
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] === void 0) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Objects with different constructors are not equivalent, but `Object`s
    // from different frames are.
    var aCtor = a.constructor, bCtor = b.constructor;
    if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                             _.isFunction(bCtor) && (bCtor instanceof bCtor))
                        && ('constructor' in a && 'constructor' in b)) {
      return false;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  _.constant = function(value) {
    return function () {
      return value;
    };
  };

  _.property = function(key) {
    return function(obj) {
      return obj[key];
    };
  };

  // Returns a predicate for checking whether an object has a given set of `key:value` pairs.
  _.matches = function(attrs) {
    return function(obj) {
      if (obj === attrs) return true; //avoid comparing an object to itself.
      for (var key in attrs) {
        if (attrs[key] !== obj[key])
          return false;
      }
      return true;
    }
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(Math.max(0, n));
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // A (possibly faster) way to get the current timestamp as an integer.
  _.now = Date.now || function() { return new Date().getTime(); };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named `property` is a function then invoke it with the
  // `object` as context; otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return void 0;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name) {
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    var render;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

  // AMD registration happens at the end for compatibility with AMD loaders
  // that may not enforce next-turn semantics on modules. Even though general
  // practice for AMD registration is to be anonymous, underscore registers
  // as a named module because, like jQuery, it is a base library that is
  // popular enough to be bundled in a third party lib, but not be part of
  // an AMD load request. Those cases could generate an error when an
  // anonymous define() is called outside of a loader request.
  if (typeof define === 'function' && define.amd) {
    define('underscore', [], function() {
      return _;
    });
  }
}).call(this);

},{}],8:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        throw TypeError('Uncaught, unspecified "error" event.');
      }
      return false;
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],9:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],10:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],11:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],12:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":11,"_process":10,"inherits":9}]},{},[2]);

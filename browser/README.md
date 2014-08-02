# mirador.js

Mirador offers a client-side moderation API client that uses cross-domain messaging to communicate with our infrastructure. This gives you a significant advantage in speed and flexibility when moderating user-generated content on-the-fly, allowing you to use mirador with static websites and CMS systems that do not allow custom server-side code.

## Getting started

To use the `mirador.js` browser client, you need both an api key and authorization for the domain on which you which to use the client. You can set up both at [http://mirador.im](http://mirador.im).

### Asynchronous loading

Since the mirador client requests cross-domain communication, it is best to load it asynchronously using our code snippet. Copy and paste this into the `<head>` element of your page:

```javascript
var ww = window, d = ww.document;
ww.mirador_fnx = []; ww.mirador_jnx = []; ww.mirador = function (){ ww.mirador_fnx.push(arguments); };
(ww.jQuery || {}).mirador = function (){ ww.mirador_jnx.push(arguments); };
var s = d.createElement('script'), h = d.getElementsByTagName('HEAD')[0];
s.src = 'http://test.mirador.im:8080/mirador.min.js'; s.async = true; h.appendChild(s);
```

This exposes a function `window.mirador` which can be used a lot like `$()` to call code on client initialization. Here's an example:


```javascript

window.mirador('your_api_key', function (client) {

	client.classifyUrls('http://static.mirador.im/test/bieber.jpg', function (err, results) {
		console.log(results);
	});
	

});

```

The client passed in is off type `MiradorBrowserClient`

### Request Objects

Requests can be made by passing in bare urls or FileList objects, or an id can be specified by providing objects of the following format:

```javascript

{
  id: 'my-unique-id',
  data: 'http://static.mirador.im/test/nsfw.jpg'
}

```

Either is fully supported, just be aware that by not specifying a url, the client will choose one based on the type of the request: urls will get the url itself as an id, each File in a FileList will get its `.name` as an id, a canvas element will similarly get its `.id`.

### MiradorBrowserClient

Methods:
<dl>
	<dt><code>classifyUrls([urls...], callback(err, results))</code></dt>
		<dd>Given a series of urls or request objects, call callback with any errors and an object of <code>id: MiradorResult</code></dd>
	<dt><code>classifyFiles(FileList, callback(err, results))</code></td>
		<dd>This simplifies classifying the input from a <code>FileField</code>. If you pass in <code>this.files</code> on a <code>change</code> event, each file's <code>.name</code> will end up mapped to a <code>MiradorResult</code></dd>
</dl>

Properties:

* `.authorized` `[Boolean]` - indicates if the client is authorized
* `.api_key` `[String]` - the API key provided in initialization. Cannot be changed (new client must be instantiated).

### MiradorResult

Properties:

* `.safe` `[Boolean]` - a flag indicating if the image (based on our threshold values) is deemed non-pornographic
* `.value` `[Float 0-1.0]` - a raw value indicating the likelyhood of the image being pornographic. Can be used to develop custom threshold values.

## Jquery Plugin

mirador.js exposes a jQuery plugin that provides a couple of jQuery-specific helpers to augment the mirador client. Use is simple:

```javascript

$.mirador('your_api_key', opts, function ($mirador) {

	$(document).on('mirador.result', function (e, results) {
		console.log(results);
	});
	
	$(document).on('mirador.error', function (e, errors) {
		console.error(errors);
	});
});

```

The main difference in the API between the regular client and the jQuery client is the jQuery client's use of custom events. In addition to the `mirador.ready` event fired by the standard client, the jQuery client does not require callbacks to `classifyUrls` and `classifyFiles`; instead, you can simply listen for events. This simplifies development.

The jQuery client also supports auto-binding to `input[type="file"]` elements. This can be adjusted by setting `opt.selector` to another elemtn to bind to `change`, or by simply setting `opt.selector = null`.

The full options:

```javascript
{
	// when the API has an error
    errorEvent: 'mirador.error',

    // result 
    resultEvent: 'mirador.result',

    // when the client is loaded
    readyEvent: 'mirador.ready',

    // when client is authorized
    loginEvent: 'mirador.login',

	// emitted on any call
    classificationEvent: 'mirador.classification',

    // bind to the result
    selector: defaultSelector,

	// the event on `selector` to bind to
    bindTo: 'change',
}
```

Events are fired on `document` if initialized by the `$.mirador` function, or will be fired on a specific element if the mirador client is initialized on a selector:


```javascript

$('#my-root').mirador('api_key', opts, function ($mirador) {
	// events will fire on #my-root
});

```
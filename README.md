# Mirador-Node
Node.js client for the mirador API

## Installation

The client is available via npm:

```bash
# save into your package.json file
npm install mirador --save
```

## Usage

### Classifying URL(s)

```javascript
var MiradorClient = require('mirador').MiradorClient,
    client = new MiradorClient('your_api_key');


// classify 3 urls
// you can either pass in urls and a callback, or a list of urls and a callback
client.classifyUrls('http://demo.mirador.im/test/baby.jpg', 'http://demo.mirador.im/test/sfw.jpg', function (err, results) {

});

// -- equal to --
client.classifyUrl(['http://demo.mirador.im/test/baby.jpg', 'http://demo.mirador.im/test/sfw.jpg'], function (err, results) {

  if (err) {
    throw err;
  }

  for(var id in results) {

    // id is the url in this case, because you didn't specify..
    console.log(id, results[id].value, results[id].safe);

  }

});

// you can also specify an id for each image you pass in
client.classifyUrls([{ id: 'baby', data: 'http://demo.mirador.im/test/baby.jpg'}], function (err, results) {

  if (err)
    throw err;

  // you can reference by the id you passed in
  console.log(results.baby, results.baby.safe);

});

```

### Classifying Files by Name

The method signature and results for classifying files is the same as by urls:

```javascript

client.classifyFiles('myimage.jpg', 'coolpix.jpg', function(err, results) {

  // results have the filename as the id by default
  console.log(results['myimage.jpg'])  

});

// or.. specify an id
client.classifyFiles([{ id: 'coolpix', data: 'coolpix.jpg' }], function (err, results) {

  // the id is now 'coolpix'
  console.log(results.coolpix);

});

```

### Classifying Image `Buffer` objects

You can also classify image buffers with `classifyBuffers`, same API as previous methods, just using buffers:

```javascript

var myImage = fs.readFileSync('coolpix.jpg');

client.classifyBuffers(myImage, function (err, results) { 

  // since it's a buffer and we have nothing to go off of, the id
  // becomes the index in the list of buffers passed in
  console.log(results[0]);

});

client.classifyBuffers([{ id: 'coolpix', data: myImage }], function (err, results) {

  // really preferred; now you can keep track a lot more easily
  console.log(results.coolpix);

});

```

## Testing

Tests are in `test/test.js`, written with nodeunit. Supply an API Key and run:

```bash
nodeunit test/test.js
```

## Support/Questions

Please submit any bugs/feature requests through github, or email support [at] mirador.im

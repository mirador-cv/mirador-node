var apikey = process.env.MIRADOR_API_KEY || 'your_api_key',
    MiradorClient = require('../index').MiradorClient,
    IM_URL = 'http://demo.mirador.im/test/',
    NSFW_URL = IM_URL + 'nsfw.jpg',
    SFW_URL = IM_URL + 'sfw.jpg';

var fs = require('fs'),
    _ = require('underscore');

module.exports = {

  testClassifyUrl: function (test) {
    test.expect(10);

    var client = new MiradorClient(apikey);

    client.classifyUrls(NSFW_URL, SFW_URL, function (err, results) {

      test.ifError(err);

      test.ok(results[NSFW_URL], 'nsfw url missing from results');
      test.ok(results[SFW_URL], 'sfw url missing from results');

      test.equal(results.size, 2, 'there are not 2 results');

      var nsfw = results[NSFW_URL],
          sfw = results[SFW_URL];

      test.ok(!nsfw.safe);
      test.ok(sfw.safe);

      test.ok(nsfw.value >= 0.5);
      test.ok(sfw.value < 0.5);

      test.equal(nsfw.id, NSFW_URL);
      test.equal(sfw.id, SFW_URL);

      test.done();
    });

  },

  testClassifyFile: function (test) {
    test.expect(6);

    var client = new MiradorClient(apikey),
        nsfw_f = 'images/nsfw.jpg',
        sfw_f = 'images/sfw.jpg';

    client.classifyFiles(nsfw_f, sfw_f, function (err, results) {

      test.ifError(err);
      test.equal(results.size, 2);

      var nsfw = results[nsfw_f],
          sfw = results[sfw_f];

      test.ok(!nsfw.safe);
      test.ok(sfw.safe);

      test.ok(nsfw.value >= 0.5);
      test.ok(sfw.value < 0.5);

      test.done();

    });

  },

  testClassifyBuffer: function (test) {
    var client = new MiradorClient(apikey);
    var nsfw_b = fs.readFileSync('images/nsfw.jpg');

    test.expect(5);

    client.classifyBuffers(nsfw_b, function (err, results) {

      test.ifError(err);

      test.equal(results.size, 1);

      // misleading; the id is '0'
      test.ok(!results[0].safe)
      test.ok(results[0].value >= 0.50);
      test.equal(results[0].id, 0);

      test.done();
    });

  },

  testChunkedUrls: function (test) {
    var client = new MiradorClient(apikey);

    var test_urls = _.map(_.range(10), function (idx) {

      return {
        id: idx,
        data: (idx % 2) ? NSFW_URL : SFW_URL,
      };

    });

    test.expect(test_urls.length);

    client.classifyUrls(test_urls, function (err, results) {

      _.each(results, function (res) {
        test.ok(res.value);
      });

      test.done();
    });

  },

  testChunkedFiles: function (test) {
    var client = new MiradorClient(apikey);

    var testfiles = _.map(_.range(10), function (idx) {

      return {
        id: idx,
        data: (idx % 2) ? 'images/nsfw.jpg' : 'images/sfw.jpg'
      };

    });

    test.expect(testfiles.length + 1);

    client.classifyFiles(testfiles, function (err, results) {

      test.equal(results.size, testfiles.length);

      _.each(results, function (res) {

        test.ok(res.value);

      });


      test.done();
    });

  },


};

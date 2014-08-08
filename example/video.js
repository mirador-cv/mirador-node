$.mirador('demo1', function (client) {

  var $doc = $(document),
      v = $('#v')[0],
      c = $('canvas')[0],
      ctx = c.getContext('2d');

  navigator.getUserMedia = (navigator.getUserMedia || 
                         navigator.webkitGetUserMedia || 
                         navigator.mozGetUserMedia || 
                         navigator.msGetUserMedia);

  navigator.getUserMedia({ video: true, audio: false },
                         function (s) {
                           var url = window.URL || window.webkitURL;
                           v.src = url ? url.createObjectURL(s) : s;
                           v.play();
                         },
                         function (err) {
                           console.error(err);
                         });

  var w = 500, h = 500;
  v.addEventListener('canplay', function () {

    if (v.videoWidth) {
      c.setAttribute('width', (w = (v.videoWidth / 2)));
      c.setAttribute('height', (h = (v.videoHeight / (v.videoWidth / parseInt(c.getAttribute('width'))))));
    }

  });

  var $safe = $('#safe'), $value = $('#value'), $porn = $('#porn');

  console.log($porn);
  var skip = false;

  v.addEventListener('play', function () {

    setInterval(function () {
      if (v.paused || v.ended) return;

      if (skip) {
        skip = false;
        return;
      }

      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(v, 0, 0, w, h);

      var durl = c.toDataURL();

      client.classifyCanvas({ id: 'di1', data: c }, function (err, results) {

        if (err) {
          skip = true;
        }

        for(var k in results) {
          $safe.html(results[k].safe ? 'safe' : 'unsafe');
          $value.html(results[k].value.toString().substring(0, 5));

          if (results[k].safe) {
            c.setAttribute('class', 'safe');
          }
          else {
            c.setAttribute('class', 'unsafe');
          }

        }

      });

    }, 500)

  });

  $doc.on('click', '#inject-porn', function () {

    ctx.drawImage($('#porn')[0], w, h);

  });


});

console.log(this);
(function (localFile, undefined) {
  var t = {}
  if (localFile.read === undefined) {
    localFile.read = function (file) {
      return t[file];
    };
  }
  if (localFile.readBytes === undefined) {
    localFile.readBytes = function (file) {
      return Uint8Array.from(localFile.read(file).join().split("").map(x => x.charCodeAt()))
    };
  }
  function push(file, s) {
    if (s !== undefined) {
      t[file].push(s)
    }
    return function (t) {
      return push(file, t)
    }
  }
  localFile.register = function (file) {
    t[file] = new Array()
    return push(file, undefined)
  }
})((window.localFile = window.localFile || {}));

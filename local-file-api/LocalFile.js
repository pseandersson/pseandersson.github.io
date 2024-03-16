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
  localFile.register = function (file) {
    t[file] = new Array()
    return function(s) {
        t[file].push(s)
    }
  }
})((window.localFile = window.localFile || {}));

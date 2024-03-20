(function (localFile, undefined) {
  const t = {}
  var current_file;

  if (localFile.read === undefined) {
    localFile.read = async function (file) { 
      return new Promise((resolve, reject) => {
        if (t[file] === undefined) {
          const node = document.createElement("script")
          node.setAttribute("src", file)
          // node.async = true
          current_file = file
          document.querySelector("head").append(node)
          const timeout = setTimeout( _ => reject("Timeout"), 1000);
          node.onload = _ => localFile.read(file).then( _ => {
            resolve(t[file])
            current_file = undefined
            clearTimeout(timeout)
            document.querySelector("head").removeChild(node)
          })
        } else {
          resolve(t[file])
        }
      })
    };
  }
  if (localFile.readBytes === undefined) {
    localFile.readBytes = async function (file) {
      return Uint8Array.from((await localFile.read(file)).join().split("").map(x => x.charCodeAt()))
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
  localFile.header = function () {
    t[current_file] = new Array()

    return push(current_file, undefined)
  }
})((window.localFile = window.localFile || {}));

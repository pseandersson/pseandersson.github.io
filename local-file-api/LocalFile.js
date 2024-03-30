(function (localFile, undefined) {
  const t = {}
  var current_file;

  if (localFile.read === undefined) {
    localFile.read = async function (file) { 
      return new Promise((resolve, reject) => {
        if (t[file] === undefined) {
          const node = document.createElement("script")
          node.src = file
          current_file = file

          node.onerror = ev => {
            document.querySelector("head").removeChild(node)
            reject(ev)
          }

          node.onload = _ => localFile.read(file).catch((reason) => reject(reason)).then( _ => {
            resolve(t[file])
            current_file = undefined
            document.querySelector("head").removeChild(node)
            node.onerror = undefined
          })

          document.querySelector("head").append(node)
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

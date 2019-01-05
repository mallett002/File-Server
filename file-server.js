const {createServer} = require('http');

const methods = Object.create(null);

// --------------------CREATE THE SERVER--------------------------------------
createServer((request, response) => {
    let handler = methods[request.method] || notAllowed;
    handler(request)
        // handle errors when rejected promise
        .catch(error => {
            if (error.status !== null) return error;
            return {body: String(error), status: 500};
        })
        .then(({body, status = 200, type = "text/plain"}) => {
            response.writeHead(status, {"Content-Type": type});
            // body.pipe will forward content from readable to writable stream
            if (body && body.pipe) body.pipe(response);
            else response.end(body);
        });
}).listen(8000);

async function notAllowed(request) {
    return {
        status: 405,
        body: `Method ${request.method} not allowed.`
    };
}

// --------------------GET URL PATH--------------------------------------
// To figure out which file path corresponds to a request URL
// Resolves pathName relative to program's working directory

const {parse} = require('url');
const {resolve, sep} = require('path');

const baseDirectory = process.cwd();

function urlPath(url) {
    let {pathName} = parse(url);
    let path = resolve(decodeURIComponent(pathName).slice(1));

    // if path doesn't start with base directory, throw error
    if (path !== baseDirectory &&
        !path.startsWith(baseDirectory + sep)) {
            throw {status: 403, body: "Forbidden"};
        }
    return path;
}


// ----------------------GET METHOD ------------------------------------------
// run npm install mime@2.2.0 to get mime

// Get method returns list of files when reading a dir
// and returns content when reading a file
const {createReadStream} = require('fs'); 
const {stat, readdir} = require('fs').promises; // stat method helps us find out if file exists and if it's in the dir
const mime = require('mime');  // mime gives us Content-Type header of the file

methods.GET = async function(request) {
    let path = urlPath(request.url);
    let stats;
    try {
        stats = await stat(path);
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        else return {status: 404, body: "File not found"};
    }
    if (stats.isDirectory()) {
        return {body: await readdir(path).join("\n")};
    } else {
        return {
            body: createReadStream(path),
            type: mime.getType(path)
        };
    }
};


// ----------------------DELETE METHOD ------------------------------------------
const {rmdir, unlink} = require('fs').promises;

methods.DELETE = async function(request) {
    let path = urlPath(request.url);
    let stats;

    try {
        stats = await stat(path);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        else return {status: 204}; // 204 for "no content"
    }

    if (stats.isDirectory()) await rmdir(path);
    else await unlink(path);
    return {status: 204};
}


// ----------------------PUT METHOD ------------------------------------------
const {createWriteStream} = require('fs');
// use createWriteStream(path) to write the file one piece at a time

// Use pipe to move readable stream to writeable one
// So, move from the request to the file
function pipeStream(from, to) {
    // pipe isn't written to return a promise, so wrap it in one
    return new Promise((resolve, reject) => {
        from.on("error", reject);
        to.on("error", reject);
        to.on("finish", resolve);
        from.pipe(to);
    });
}

methods.PUT = async function(request) {
    let path = urlPath(request.url);
    await pipeStream(request, createWriteStream(path));
    return {status: 204}; 
};

/*
The command line tool `curl` is used to make HTTP requests
The `-X` is used to set the request's method and `-d` is used to include a request body

Ex:
$curl http://localhost:8000/file.txt
File not found

$curl -X PUT -d hello http://localhost:8000/file.txt
$curl http://localhost:8000/file.txt
hello

$curl -X DELETE http://localhost:8000/file.txt
$curl http://localhost:8000/file.txt
File not found
*/
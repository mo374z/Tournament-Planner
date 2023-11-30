const http = require('http');



const server = http.createServer(route);

server.listen(3000);

function route(req, res){


    if(req.url == '/'){
        res.write('Hallo Es lauft...');
    }


    if(req.url == '/Bude'){
        res.write('Bude hier...');
    }

    res.end();
}
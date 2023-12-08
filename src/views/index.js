// this is the main entry point of our application and should only contain the absolute minimum code needed to start our application

const path = require('path')
const express = require('express')
const exphbs = require('express-handlebars')

const app = express()

app.engine('.hbs', exphbs.engine({
  defaultLayout: 'main',
  extname: '.hbs',
  layoutsDir: path.join(__dirname, 'views/layouts')
}))
app.set('view engine', '.hbs')
app.set('views', path.join(__dirname, 'views'))
app.listen(3000)

app.get('/', (request, response) => {
    response.render('home', {
      name: 'John'
    })
  })

  
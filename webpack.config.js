var webpack = require('webpack')
var path = require('path')
module.exports = {
    entry: {
        index: './browser.js'
    },
    output: {
        path: path.join(__dirname, 'dist'),
        library: 'msgpackr',
        libraryTarget: 'umd'
    },
    node: { Buffer: false },
    devtool: 'source-map',
    optimization: {
        minimize: false
    },
    mode: 'development'
};

const path = require('path');

module.exports = {
  entry: './src/index.ts',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: [/node_modules/, /\.spec\.ts$/],
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: 'widget.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'ErghiWidget',
    libraryTarget: 'umd',
    libraryExport: 'default',
    globalObject: 'this',
  },
  optimization: {
    minimize: true,
  },
};

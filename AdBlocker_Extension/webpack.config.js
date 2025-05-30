const path = require('path');

module.exports = {
  target:['web'],
  entry: {
    background: './src/background.js', // Entry point for background script
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, './'), // Output directory
  },
  mode: 'production',
  resolve: {
    extensions: ['.js'],
  },
  module: {
    rules: [
      {
        test: /\.js$/, // Process JavaScript files
        exclude: /node_modules/, // Exclude dependencies
        use: {
          loader: 'babel-loader', // Transpile modern JS for compatibility
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
      {
        test: /\.(json|bin)$/i,
        type: 'asset/resource', // Include non-JS assets
      },
    ],
  }
};

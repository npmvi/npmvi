var package = require('./package.json');
var dependencies = Object.keys(package.dependencies || {});
var moduleName = dependencies[0];
var modulePackage = require('./node_modules/' + moduleName + '/package.json');
module.exports = {
  index: require(moduleName),
  package: modulePackage,
  isNPVI: true,
};

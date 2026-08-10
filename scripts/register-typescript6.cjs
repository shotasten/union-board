const Module = require('node:module');

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveTypeScript6(request, parent, isMain, options) {
  if (request === 'typescript') request = 'typescript6';
  else if (request.startsWith('typescript/')) request = `typescript6/${request.slice('typescript/'.length)}`;
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

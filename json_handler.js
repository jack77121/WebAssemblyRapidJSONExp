// The Module object: Our interface to the outside world. We import
// and export values on it, and do the work to get that through
// closure compiler if necessary. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to do an eval in order to handle the closure compiler
// case, where this code here is minified but Module was defined
// elsewhere (e.g. case 4 above). We also need to check if Module
// already exists (e.g. case 3 above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module;
if (!Module) Module = (typeof Module !== 'undefined' ? Module : null) || {};

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
var key;
for (key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('The provided Module[\'ENVIRONMENT\'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  if (!Module['print']) Module['print'] = console.log;
  if (!Module['printErr']) Module['printErr'] = console.warn;

  var nodeFS;
  var nodePath;

  Module['read'] = function shell_read(filename, binary) {
    var ret;
    ret = tryParseAsDataURI(filename);
    if (!ret) {
      if (!nodeFS) nodeFS = require('fs');
      if (!nodePath) nodePath = require('path');
      filename = nodePath['normalize'](filename);
      ret = nodeFS['readFileSync'](filename);
    }
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  if (!Module['thisProgram']) {
    if (process['argv'].length > 1) {
      Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    } else {
      Module['thisProgram'] = 'unknown-program';
    }
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (!Module['print']) Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr; // not present in v8 or older sm

  if (typeof read != 'undefined') {
    Module['read'] = function shell_read(f) {
      var data = tryParseAsDataURI(f);
      if (data) {
        return intArrayToString(data);
      }
      return read(f);
    };
  } else {
    Module['read'] = function shell_read() { throw 'no read() available' };
  }

  Module['readBinary'] = function readBinary(f) {
    var data;
    data = tryParseAsDataURI(f);
    if (data) {
      return data;
    }
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof quit === 'function') {
    Module['quit'] = function(status, toThrow) {
      quit(status);
    }
  }
}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function shell_read(url) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      return xhr.responseText;
    } catch (err) {
      var data = tryParseAsDataURI(url);
      if (data) {
        return intArrayToString(data);
      }
      throw err;
    }
  };

  if (ENVIRONMENT_IS_WORKER) {
    Module['readBinary'] = function readBinary(url) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
        return new Uint8Array(xhr.response);
      } catch (err) {
        var data = tryParseAsDataURI(url);
        if (data) {
          return data;
        }
        throw err;
      }
    };
  }

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
        return;
      }
      var data = tryParseAsDataURI(url);
      if (data) {
        onload(data.buffer);
        return;
      }
      onerror();
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof console !== 'undefined') {
    if (!Module['print']) Module['print'] = function shell_print(x) {
      console.log(x);
    };
    if (!Module['printErr']) Module['printErr'] = function shell_printErr(x) {
      console.warn(x);
    };
  } else {
    // Probably a worker, and without console.log. We can do very little here...
    var TRY_USE_DUMP = false;
    if (!Module['print']) Module['print'] = (TRY_USE_DUMP && (typeof(dump) !== "undefined") ? (function(x) {
      dump(x);
    }) : (function(x) {
      // self.postMessage(x); // enable this if you want stdout to be sent as messages
    }));
  }

  if (typeof Module['setWindowTitle'] === 'undefined') {
    Module['setWindowTitle'] = function(title) { document.title = title };
  }
}
else {
  // Unreachable because SHELL is dependent on the others
  throw new Error('Unknown runtime environment. Where are we?');
}

if (!Module['print']) {
  Module['print'] = function(){};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
if (!Module['thisProgram']) {
  Module['thisProgram'] = './this.program';
}
if (!Module['quit']) {
  Module['quit'] = function(status, toThrow) {
    throw toThrow;
  }
}

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Callbacks
Module['preRun'] = [];
Module['postRun'] = [];

// Merge back in the overrides
for (key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

//========================================
// Runtime code shared with compiler
//========================================

var Runtime = {
  setTempRet0: function (value) {
    tempRet0 = value;
    return value;
  },
  getTempRet0: function () {
    return tempRet0;
  },
  stackSave: function () {
    return STACKTOP;
  },
  stackRestore: function (stackTop) {
    STACKTOP = stackTop;
  },
  getNativeTypeSize: function (type) {
    switch (type) {
      case 'i1': case 'i8': return 1;
      case 'i16': return 2;
      case 'i32': return 4;
      case 'i64': return 8;
      case 'float': return 4;
      case 'double': return 8;
      default: {
        if (type[type.length-1] === '*') {
          return Runtime.QUANTUM_SIZE; // A pointer
        } else if (type[0] === 'i') {
          var bits = parseInt(type.substr(1));
          assert(bits % 8 === 0);
          return bits/8;
        } else {
          return 0;
        }
      }
    }
  },
  getNativeFieldSize: function (type) {
    return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
  },
  STACK_ALIGN: 16,
  prepVararg: function (ptr, type) {
    if (type === 'double' || type === 'i64') {
      // move so the load is aligned
      if (ptr & 7) {
        assert((ptr & 7) === 4);
        ptr += 4;
      }
    } else {
      assert((ptr & 3) === 0);
    }
    return ptr;
  },
  getAlignSize: function (type, size, vararg) {
    // we align i64s and doubles on 64-bit boundaries, unlike x86
    if (!vararg && (type == 'i64' || type == 'double')) return 8;
    if (!type) return Math.min(size, 8); // align structures internally to 64 bits
    return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
  },
  dynCall: function (sig, ptr, args) {
    if (args && args.length) {
      assert(args.length == sig.length-1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
    } else {
      assert(sig.length == 1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].call(null, ptr);
    }
  },
  functionPointers: [],
  addFunction: function (func) {
    for (var i = 0; i < Runtime.functionPointers.length; i++) {
      if (!Runtime.functionPointers[i]) {
        Runtime.functionPointers[i] = func;
        return 2*(1 + i);
      }
    }
    throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
  },
  removeFunction: function (index) {
    Runtime.functionPointers[(index-2)/2] = null;
  },
  warnOnce: function (text) {
    if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
    if (!Runtime.warnOnce.shown[text]) {
      Runtime.warnOnce.shown[text] = 1;
      Module.printErr(text);
    }
  },
  funcWrappers: {},
  getFuncWrapper: function (func, sig) {
    if (!func) return; // on null pointer, return undefined
    assert(sig);
    if (!Runtime.funcWrappers[sig]) {
      Runtime.funcWrappers[sig] = {};
    }
    var sigCache = Runtime.funcWrappers[sig];
    if (!sigCache[func]) {
      // optimize away arguments usage in common cases
      if (sig.length === 1) {
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func);
        };
      } else if (sig.length === 2) {
        sigCache[func] = function dynCall_wrapper(arg) {
          return Runtime.dynCall(sig, func, [arg]);
        };
      } else {
        // general case
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func, Array.prototype.slice.call(arguments));
        };
      }
    }
    return sigCache[func];
  },
  getCompilerSetting: function (name) {
    throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
  },
  stackAlloc: function (size) { var ret = STACKTOP;STACKTOP = (STACKTOP + size)|0;STACKTOP = (((STACKTOP)+15)&-16);(assert((((STACKTOP|0) < (STACK_MAX|0))|0))|0); return ret; },
  staticAlloc: function (size) { var ret = STATICTOP;STATICTOP = (STATICTOP + (assert(!staticSealed),size))|0;STATICTOP = (((STATICTOP)+15)&-16); return ret; },
  dynamicAlloc: function (size) { assert(DYNAMICTOP_PTR);var ret = HEAP32[DYNAMICTOP_PTR>>2];var end = (((ret + size + 15)|0) & -16);HEAP32[DYNAMICTOP_PTR>>2] = end;if (end >= TOTAL_MEMORY) {var success = enlargeMemory();if (!success) {HEAP32[DYNAMICTOP_PTR>>2] = ret;return 0;}}return ret;},
  alignMemory: function (size,quantum) { var ret = size = Math.ceil((size)/(quantum ? quantum : 16))*(quantum ? quantum : 16); return ret; },
  makeBigInt: function (low,high,unsigned) { var ret = (unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0))); return ret; },
  GLOBAL_BASE: 8,
  QUANTUM_SIZE: 4,
  __dummy__: 0
}



Module["Runtime"] = Runtime;



//========================================
// Runtime essentials
//========================================

var ABORT = 0; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
  return func;
}

var JSfuncs = {
  // Helpers for cwrap -- it can't refer to Runtime directly because it might
  // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
  // out what the minified function name is.
  'stackSave': function() {
    Runtime.stackSave()
  },
  'stackRestore': function() {
    Runtime.stackRestore()
  },
  // type conversion from js to c
  'arrayToC' : function(arr) {
    var ret = Runtime.stackAlloc(arr.length);
    writeArrayToMemory(arr, ret);
    return ret;
  },
  'stringToC' : function(str) {
    var ret = 0;
    if (str !== null && str !== undefined && str !== 0) { // null string
      // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
      var len = (str.length << 2) + 1;
      ret = Runtime.stackAlloc(len);
      stringToUTF8(str, ret, len);
    }
    return ret;
  }
};
// For fast lookup of conversion functions
var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

// C calling interface.
function ccall (ident, returnType, argTypes, args, opts) {
  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  assert(returnType !== 'array', 'Return type should not be "array".');
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = Runtime.stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);
  if (returnType === 'string') ret = Pointer_stringify(ret);
  if (stack !== 0) {
    Runtime.stackRestore(stack);
  }
  return ret;
}

function cwrap (ident, returnType, argTypes) {
  argTypes = argTypes || [];
  var cfunc = getCFunc(ident);
  // When the function takes numbers and returns a number, we can just return
  // the original function
  var numericArgs = argTypes.every(function(type){ return type === 'number'});
  var numericRet = returnType !== 'string';
  if (numericRet && numericArgs) {
    return cfunc;
  }
  return function() {
    return ccall(ident, returnType, argTypes, arguments);
  }
}

Module["ccall"] = ccall;
Module["cwrap"] = cwrap;

/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}
Module["setValue"] = setValue;

/** @type {function(number, string, boolean=)} */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for getValue: ' + type);
    }
  return null;
}
Module["getValue"] = getValue;

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate
Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
Module["ALLOC_STACK"] = ALLOC_STACK;
Module["ALLOC_STATIC"] = ALLOC_STATIC;
Module["ALLOC_DYNAMIC"] = ALLOC_DYNAMIC;
Module["ALLOC_NONE"] = ALLOC_NONE;

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((TypedArray|Array<number>|number), string, number, number=)} */
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : Runtime.staticAlloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var stop;
    ptr = ret;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(/** @type {!Uint8Array} */ (slab), ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = Runtime.getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}
Module["allocate"] = allocate;

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return Runtime.staticAlloc(size);
  if (!runtimeInitialized) return Runtime.dynamicAlloc(size);
  return _malloc(size);
}
Module["getMemory"] = getMemory;

/** @type {function(number, number=)} */
function Pointer_stringify(ptr, length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return Module['UTF8ToString'](ptr);
}
Module["Pointer_stringify"] = Pointer_stringify;

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}
Module["AsciiToString"] = AsciiToString;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}
Module["stringToAscii"] = stringToAscii;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}
Module["UTF8ArrayToString"] = UTF8ArrayToString;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}
Module["UTF8ToString"] = UTF8ToString;

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}
Module["stringToUTF8Array"] = stringToUTF8Array;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}
Module["stringToUTF8"] = stringToUTF8;

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}
Module["lengthBytesUTF8"] = lengthBytesUTF8;

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}


function UTF32ToString(ptr) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}


function demangle(func) {
  var __cxa_demangle_func = Module['___cxa_demangle'] || Module['__cxa_demangle'];
  if (__cxa_demangle_func) {
    try {
      var s =
        func.substr(1);
      var len = lengthBytesUTF8(s)+1;
      var buf = _malloc(len);
      stringToUTF8(s, buf, len);
      var status = _malloc(4);
      var ret = __cxa_demangle_func(buf, 0, 0, status);
      if (getValue(status, 'i32') === 0 && ret) {
        return Pointer_stringify(ret);
      }
      // otherwise, libcxxabi failed
    } catch(e) {
      // ignore problems here
    } finally {
      if (buf) _free(buf);
      if (status) _free(status);
      if (ret) _free(ret);
    }
    // failure when using libcxxabi, don't demangle
    return func;
  }
  Runtime.warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (x + ' [' + y + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}
Module["stackTrace"] = stackTrace;

// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  HEAPU32[(STACK_MAX >> 2)-1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)-2] = 0x89BACDFE;
}

function checkStackCookie() {
  if (HEAPU32[(STACK_MAX >> 2)-1] != 0x02135467 || HEAPU32[(STACK_MAX >> 2)-2] != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + HEAPU32[(STACK_MAX >> 2)-2].toString(16) + ' ' + HEAPU32[(STACK_MAX >> 2)-1].toString(16));
  }
  // Also test the global address 0 for integrity. This check is not compatible with SAFE_SPLIT_MEMORY though, since that mode already tests all address 0 accesses on its own.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - Module['asm'].stackSave() + allocSize) + ' bytes available!');
}

function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or (4) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}


function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK) Module.printErr('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined,
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  assert(buffer.byteLength === TOTAL_MEMORY);
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

Module['HEAP'] = HEAP;
Module['buffer'] = buffer;
Module['HEAP8'] = HEAP8;
Module['HEAP16'] = HEAP16;
Module['HEAP32'] = HEAP32;
Module['HEAPU8'] = HEAPU8;
Module['HEAPU16'] = HEAPU16;
Module['HEAPU32'] = HEAPU32;
Module['HEAPF32'] = HEAPF32;
Module['HEAPF64'] = HEAPF64;

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  checkStackCookie();
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}
Module["addOnPreRun"] = addOnPreRun;

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}
Module["addOnInit"] = addOnInit;

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}
Module["addOnPreMain"] = addOnPreMain;

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}
Module["addOnExit"] = addOnExit;

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}
Module["addOnPostRun"] = addOnPostRun;

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated */
function writeStringToMemory(string, buffer, dontAddNull) {
  Runtime.warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}
Module["writeStringToMemory"] = writeStringToMemory;

function writeArrayToMemory(array, buffer) {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}
Module["writeArrayToMemory"] = writeArrayToMemory;

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}
Module["writeAsciiToMemory"] = writeAsciiToMemory;

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}

// check for imul support, and also for correctness ( https://bugs.webkit.org/show_bug.cgi?id=126345 )
if (!Math['imul'] || Math['imul'](0xffffffff, 5) !== -5) Math['imul'] = function imul(a, b) {
  var ah  = a >>> 16;
  var al = a & 0xffff;
  var bh  = b >>> 16;
  var bl = b & 0xffff;
  return (al*bl + ((ah*bl + al*bh) << 16))|0;
};
Math.imul = Math['imul'];


if (!Math['clz32']) Math['clz32'] = function(x) {
  x = x >>> 0;
  for (var i = 0; i < 32; i++) {
    if (x & (1 << (31 - i))) return i;
  }
  return 32;
};
Math.clz32 = Math['clz32']

if (!Math['trunc']) Math['trunc'] = function(x) {
  return x < 0 ? Math.ceil(x) : Math.floor(x);
};
Math.trunc = Math['trunc'];

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}
Module["addRunDependency"] = addRunDependency;

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}
Module["removeRunDependency"] = removeRunDependency;

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;



// === Body ===

var ASM_CONSTS = [];




STATIC_BASE = Runtime.GLOBAL_BASE;

STATICTOP = STATIC_BASE + 13360;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_json_handler_cpp() } }, { func: function() { __GLOBAL__sub_I_bind_cpp() } });


memoryInitializer = "data:application/octet-stream;base64,AAAAAAAA8D8AAAAAAAAkQAAAAAAAAFlAAAAAAABAj0AAAAAAAIjDQAAAAAAAavhAAAAAAICELkEAAAAA0BJjQQAAAACE15dBAAAAAGXNzUEAAAAgX6ACQgAAAOh2SDdCAAAAopQabUIAAEDlnDCiQgAAkB7EvNZCAAA0JvVrDEMAgOA3ecNBQwCg2IVXNHZDAMhOZ23Bq0MAPZFg5FjhQ0CMtXgdrxVEUO/i1uQaS0SS1U0Gz/CARPZK4ccCLbVEtJ3ZeUN46kSRAigsKosgRTUDMrf0rVRFAoT+5HHZiUWBEh8v5yfARSHX5vrgMfRF6oygOVk+KUYksAiI741fRhduBbW1uJNGnMlGIuOmyEYDfNjqm9D+RoJNx3JhQjNH4yB5z/kSaEcbaVdDuBeeR7GhFirTztJHHUqc9IeCB0ilXMPxKWM9SOcZGjf6XXJIYaDgxHj1pkh5yBj21rLcSEx9z1nG7xFJnlxD8LdrRknGM1TspQZ8SVygtLMnhLFJc8ihoDHl5UmPOsoIfl4bSppkfsUOG1FKwP3ddtJhhUowfZUUR7q6Sj5u3WxstPBKzskUiIfhJEtB/Blq6RlaS6k9UOIxUJBLE03kWj5kxEtXYJ3xTX35S224BG6h3C9MRPPC5OTpY0wVsPMdXuSYTBuccKV1Hc9MkWFmh2lyA031+T/pA084TXL4j+PEYm5NR/s5Drv9ok0ZesjRKb3XTZ+YOkZ0rA1OZJ/kq8iLQk49x93Wui53Tgw5lYxp+qxOp0Pd94Ec4k6RlNR1oqMWT7W5SROLTExPERQO7NavgU8WmRGnzBu2T1v/1dC/outPmb+F4rdFIVB/LyfbJZdVUF/78FHv/IpQG502kxXewFBiRAT4mhX1UHtVBbYBWypRbVXDEeF4YFHIKjRWGZeUUXo1wavfvMlRbMFYywsWAFLH8S6+jhs0Ujmuum1yImlSx1kpCQ9rn1Id2Lll6aLTUiROKL+jiwhTrWHyroyuPlMMfVftFy1zU09crehd+KdTY7PYYnX23VMecMddCboSVCVMObWLaEdULp+Hoq5CfVR9w5QlrUmyVFz0+W4Y3OZUc3G4ih6THFXoRrMW89tRVaIYYNzvUoZVyh5406vnu1U/Eytky3DxVQ7YNT3+zCVWEk6DzD1AW1bLENKfJgiRVv6UxkcwSsVWPTq4Wbyc+lZmJBO49aEwV4DtFyZzymRX4Oid7w/9mVeMscL1KT7QV+9dM3O0TQRYazUAkCFhOVjFQgD0ablvWLspgDji06NYKjSgxtrI2Fg1QUh4EfsOWcEoLevqXENZ8XL4pSU0eFmtj3YPL0GuWcwZqmm96OJZP6AUxOyiF1pPyBn1p4tNWjIdMPlId4JafiR8NxsVt1qeLVsFYtrsWoL8WEN9CCJbozsvlJyKVluMCju5Qy2MW5fmxFNKnMFbPSC26FwD9ltNqOMiNIQrXDBJzpWgMmFcfNtBu0h/lVxbUhLqGt/KXHlzS9JwywBdV1DeBk3+NF1t5JVI4D1qXcSuXS2sZqBddRq1OFeA1F0SYeIGbaAJXqt8TSREBEBe1ttgLVUFdF7MErl4qgapXn9X5xZVSN9er5ZQLjWNE19bvOR5gnBIX3LrXRijjH5fJ7M67+UXs1/xXwlr393nX+23y0VX1R1g9FKfi1alUmCxJ4curE6HYJ3xKDpXIr1gApdZhHY18mDD/G8l1MImYfT7yy6Jc1xheH0/vTXIkWHWXI8sQzrGYQw0s/fTyPthhwDQeoRdMWKpAISZ5bRlYtQA5f8eIptihCDvX1P10GKl6Oo3qDIFY8+i5UVSfzpjwYWva5OPcGMyZ5tGeLOkY/5AQlhW4Nljn2gp9zUsEGTGwvN0QzdEZHizMFIURXlkVuC8ZlmWr2Q2DDbg973jZEOPQ9h1rRhlFHNUTtPYTmXsx/QQhEeDZej5MRVlGbhlYXh+Wr4f7mU9C4/41tMiZgzOsrbMiFdmj4Ff5P9qjWb5sLvu32LCZjidauqX+/ZmhkQF5X26LGfUSiOvjvRhZ4kd7FqycZZn6ySn8R4OzGcTdwhX04gBaNeUyiwI6zVoDTr9N8pla2hIRP5inh+haFrVvfuFZ9VosUqtemfBCmmvTqys4LhAaVpi19cY53Rp8TrNDd8gqmnWRKBoi1TgaQxWyEKuaRRqj2t60xmESWpzBllIIOV/agikNy0077NqCo2FOAHr6GpM8KaGwSUfazBWKPSYd1Nru2syMX9ViGuqBn/93mq+aypkb17LAvNrNT0LNn7DJ2yCDI7DXbRdbNHHOJq6kJJsxvnGQOk0x2w3uPiQIwL9bCNzmzpWITJt609CyaupZm3m45K7FlScbXDOOzWOtNFtDMKKwrEhBm6Pci0zHqo7bpln/N9SSnFuf4H7l+ecpW7fYfp9IQTbbix9vO6U4hBvdpxrKjobRW+Ugwa1CGJ6bz0SJHFFfbBvzBZtzZac5G9/XMiAvMMZcM85fdBVGlBwQ4icROsghHBUqsMVJim5cOmUNJtvc+9wEd0AwSWoI3FWFEExL5JYcWtZkf26to5x49d63jQyw3HcjRkWwv73cVPxn5ty/i1y1PZDoQe/YnKJ9JSJyW6Xcqsx+ut7Ss1yC198c41OAnPNdlvQMOI2c4FUcgS9mmxz0HTHIrbgoXMEUnmr41jWc4amV5Yc7wt0FMj23XF1QXQYenRVztJ1dJ6Y0eqBR6t0Y//CMrEM4XQ8v3N/3U8VdQuvUN/Uo0p1Z22SC2WmgHXACHdO/s+0dfHKFOL9A+p11v5MrX5CIHaMPqBYHlNUdi9OyO7lZ4l2u2F6at/Bv3YVfYyiK9nzdlqcL4t2zyh3cIP7LVQDX3cmMr2cFGKTd7B+7MOZOsh3XJ7nNEBJ/nf5whAhyO0yeLjzVCk6qWd4pTCqs4iTnXhnXkpwNXzSeAH2XMxCGwd5gjN0fxPiPHkxoKgvTA1yeT3IkjufkKZ5TXp3Csc03HlwrIpm/KAReoxXLYA7CUZ6b604YIqLe3plbCN8Njexen9HLBsEheV6Xln3IUXmGnvblzo1689Qe9I9iQLmA4V7Ro0rg99EuntMOPuxC2vwe18Gep7OhSR89ocYRkKnWXz6VM9riQiQfDgqw8arCsR8x/RzuFYN+Xz48ZBmrFAvfTuXGsBrkmN9Cj0hsAZ3mH1MjClcyJTOfbD3mTn9HAN+nHUAiDzkN34DkwCqS91tfuJbQEpPqqJ+2nLQHONU136QjwTkGyoNf7rZgm5ROkJ/KZAjyuXIdn8zdKw8H3usf6DI64XzzOF/iAIcCKDVj/p2vz6if+GuunasVTAg+xaL6jXOXUqJQs8tO2VVqrBrmt9FGj0Dzxrmysaaxxf+cKtP3Ly+/LF3/wzWa0HvkVa+PPx/kK0f0I2DmlUxKFxR07XJpq2PrHGdy4vuI3cinOptU3hAkUnMrlfOtl15EjyCN1b7TTaUEMJPmEg4b+qWkMc6giXLhXTX9Je/l83PhqDlrCoXmAo0746yNSr7ZziyOz/G0t/UyIS6zdMaJ0TdxZbJJbvOn2uThKVifSRsrNv22l8NWGaroybxw96T+OLzuID/qqittbWLSnxsBV9ih1MwwTRg/7zJVSa6kYyFTpa9filwJHf534+45bifvd+mlH10iM9fqfjPm6iPk3BEuWsVD7/48AiKtjExZVUlsM2sf3vQxuI/mQY7KyrEEFzk05JzaZkkJKoOygCD8rWH/esaEZJkCOW8zIhQbwnMvIwsZRniWBe30QAAAAAAAECcAAAAABCl1OgAAGKsxet4rYQJlPh4OT+BsxUHyXvOl8BwXOp7zjJ+j2iA6aukONLVRSKaFyYnT58n+8TUMaJj7aityIw4Zd6w22WrGo4Ix4OaHXFC+R1dxFjnG6YsaU2S6o1wGmTuAdpKd++amaNtooVrfbR7eAnydxjdeaHkVLTCxZtbkoZbhj1dlsjFUzXIs6CX+ly0KpXjX6CZvZ9G3iWMOds0wpulXJ+Yo3KaxvbOvulUU7/ct+JBIvIX8/yIpXhc05vOIMzfUyF781oWmDowH5fctaDilrPjXFPR2ag8RKek2Xyb+xBEpKdMTHa7GpxAtu+Oq4sshFemEO8f0CkxkenlpBCbnQycofubEOcp9Dti2SAorIXPp3peS0SALd2sA0DkIb+P/0ReL5xnjkG4jJydFzPUqRvjtJLbGZ7Zd9+6br+W62vu8Js7Aoev8BAAAIobAACYEQAAkhsAAAAAAABoDAAAmBEAAJsbAAABAAAAaAwAAPAQAADsGwAAtBEAAK0bAAAAAAAAAQAAAJAMAAAAAAAA8BAAAEMfAADwEAAAYh8AAPAQAACBHwAA8BAAAKAfAADwEAAAvx8AAPAQAADeHwAA8BAAAP0fAADwEAAAHCAAAPAQAAA7IAAA8BAAAFogAADwEAAAeSAAAPAQAACYIAAA8BAAALcgAAC0EQAAyiAAAAAAAAABAAAAkAwAAAAAAAC0EQAACSEAAAAAAAABAAAAkAwAAAAAAADwEAAAYCsAABgRAADAKwAAYA0AAAAAAAAYEQAAbSsAAHANAAAAAAAA8BAAAI4rAAAYEQAAmysAAFANAAAAAAAAGBEAAOMsAABIDQAAAAAAABgRAADwLAAASA0AAAAAAAAYEQAAAC0AAJgNAAAAAAAAGBEAADUtAABgDQAAAAAAABgRAAARLQAAuA0AAAAAAAAYEQAAVy0AAGANAAAAAAAAfBEAAH8tAAB8EQAAgS0AAHwRAACELQAAfBEAAIYtAAB8EQAAiC0AAHwRAACKLQAAfBEAAIwtAAB8EQAAji0AAHwRAACQLQAAfBEAAJItAAB8EQAAlC0AAHwRAACWLQAAfBEAAJgtAAB8EQAAmi0AABgRAACcLQAAUA0AAAAAAAABAAAACgAAAGQAAADoAwAAECcAAKCGAQBAQg8AgJaYAADh9QUAypo7cAwAAJgMAACYDAAAcAwAACgOAABwDAAAKA4AAHAMAACYDAAA6A0AAHAMAACYDAAA6A0AAHAMAAAoDgAA6A0AAHAMAACYDAAAKA4AAOgNAABwDAAAmAwAAJgMAADwDgAABQAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAMAAAAbMAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAA//////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4C8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAwAAACMwAAAABAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAK/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYBAAAAUAAABXKwAAAAAAAFANAAAGAAAABwAAAAgAAAAJAAAACgAAAAsAAAAMAAAADQAAAAAAAAB4DQAABgAAAA4AAAAIAAAACQAAAAoAAAAPAAAAEAAAABEAAAAAAAAAiA0AABIAAAATAAAAFAAAAAAAAACYDQAAFQAAABYAAAAXAAAAAAAAAKgNAAAVAAAAGAAAABcAAAAAAAAA2A0AAAYAAAAZAAAACAAAAAkAAAAaAAAAAAAAAMgNAAAGAAAAGwAAAAgAAAAJAAAAHAAAAAAAAABYDgAABgAAAB0AAAAIAAAACQAAAAoAAAAeAAAAHwAAACAAAAA8+1f7cvuM+6f7wfvc+/b7Efws/Eb8Yfx7/Jb8sfzL/Ob8AP0b/TX9UP1r/YX9oP26/dX97/0K/iX+P/5a/nT+j/6p/sT+3/75/hT/Lv9J/2P/fv+Z/7P/zv/o/wMAHgA4AFMAbQCIAKIAvQDYAPIADQEnAUIBXAF3AZIBrAHHAeEB/AEWAjECTAJmAoECmwK2AtAC6wIGAyADOwNVA3ADiwOlA8AD2gP1Aw8EKgQAAAkACgADAAQABRz2A25hbWUAdG90YWxfc3VwcGx5AG1hcABtYXAyAE15SnNvbgBHZXROYW1lAEdldFN1cHBseQBHZXRNYXAAR2V0TWFwMgBHZXRNeUpzb24AU2V0TmFtZQBTZXRTdXBwbHkAQWRkX0tleUludABBZGRfS2V5U3RyaW5nAEFkZF9BcnJheQBzdGFja18uR2V0U2l6ZSgpID09IHNpemVvZihWYWx1ZVR5cGUpAHJhcGlkanNvbi9pbmNsdWRlL3JhcGlkanNvbi9kb2N1bWVudC5oAFBhcnNlU3RyZWFtAGFsbG9jYXRvcl8AcmFwaWRqc29uL2luY2x1ZGUvcmFwaWRqc29uL2ludGVybmFsL3N0YWNrLmgAR2V0QWxsb2NhdG9yACFIYXNQYXJzZUVycm9yKCkAcmFwaWRqc29uL2luY2x1ZGUvcmFwaWRqc29uL3JlYWRlci5oAFBhcnNlAGlzLlBlZWsoKSA9PSAnbicAUGFyc2VOdWxsAHN0YWNrVG9wXwBQdXNoVW5zYWZlAHN0YWNrVG9wXyArIHNpemVvZihUKSAqIGNvdW50IDw9IHN0YWNrRW5kXwBpcy5QZWVrKCkgPT0gJ3QnAFBhcnNlVHJ1ZQBpcy5QZWVrKCkgPT0gJ2YnAFBhcnNlRmFsc2UAcy5QZWVrKCkgPT0gJ1wiJwBQYXJzZVN0cmluZwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIgAAAAAAAAAAAAAAAC8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFwAAAAAAAgAAAAMAAAAAAAAAAoAAAANAAkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUGFyc2VTdHJpbmdUb1N0cmVhbQBQYXJzZUhleDQAY29kZXBvaW50IDw9IDB4MTBGRkZGAHJhcGlkanNvbi9pbmNsdWRlL3JhcGlkanNvbi9lbmNvZGluZ3MuaABFbmNvZGUAR2V0U2l6ZSgpID49IGNvdW50ICogc2l6ZW9mKFQpAFBvcABzdHIgIT0gMCB8fCBsZW4gPT0gMHUAR2VuZXJpY1N0cmluZ1JlZgBpcy5QZWVrKCkgPT0gJ3snAFBhcnNlT2JqZWN0AEdldFNpemUoKSA+PSBzaXplb2YoVCkAVG9wAGlzLlBlZWsoKSA9PSAnWycAUGFyc2VBcnJheQBQYXJzZU51bWJlcgBuID49IDAgJiYgbiA8PSAzMDgAcmFwaWRqc29uL2luY2x1ZGUvcmFwaWRqc29uL2ludGVybmFsL3BvdzEwLmgAUG93MTAAdGhpcyAhPSAmcmhzAG9wZXJhdG9yPQBzdHIgIT0gMABOb3ROdWxsU3RyTGVuAElzT2JqZWN0KCkARmluZE1lbWJlcgBuYW1lLklzU3RyaW5nKCkATWVtYmVyQmVnaW4ATWVtYmVyRW5kAElzU3RyaW5nKCkAU3RyaW5nRXF1YWwAcmhzLklzU3RyaW5nKCkAR2V0U3RyaW5nTGVuZ3RoAGZhbHNlAG9wZXJhdG9yW10AR2V0U3RyaW5nAGRhdGFfLmYuZmxhZ3MgJiBrSW50RmxhZwBHZXRJbnQASXNBcnJheSgpAEJlZ2luAEVuZABtLT5uYW1lLklzU3RyaW5nKCkAQWNjZXB0AEdldFR5cGUoKSA9PSBrTnVtYmVyVHlwZQB0eXBlID09IGtTdHJpbmdUeXBlAHJhcGlkanNvbi9pbmNsdWRlL3JhcGlkanNvbi93cml0ZXIuaABQcmVmaXgAIWhhc1Jvb3RfAGxldmVsX3N0YWNrXy5HZXRTaXplKCkgPj0gc2l6ZW9mKExldmVsKQBFbmRPYmplY3QAIWxldmVsX3N0YWNrXy50ZW1wbGF0ZSBUb3A8TGV2ZWw+KCktPmluQXJyYXkAMCA9PSBsZXZlbF9zdGFja18udGVtcGxhdGUgVG9wPExldmVsPigpLT52YWx1ZUNvdW50ICUgMgBFbmRBcnJheQBsZXZlbF9zdGFja18udGVtcGxhdGUgVG9wPExldmVsPigpLT5pbkFycmF5AFN0cmluZwB1dXV1dXV1dWJ0bnVmcnV1dXV1dXV1dXV1dXV1dXV1dQAAIgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbWF4RGVjaW1hbFBsYWNlcyA+PSAxAHJhcGlkanNvbi9pbmNsdWRlL3JhcGlkanNvbi9pbnRlcm5hbC9kdG9hLmgAZHRvYQAwMDAxMDIwMzA0MDUwNjA3MDgwOTEwMTExMjEzMTQxNTE2MTcxODE5MjAyMTIyMjMyNDI1MjYyNzI4MjkzMDMxMzIzMzM0MzUzNjM3MzgzOTQwNDE0MjQzNDQ0NTQ2NDc0ODQ5NTA1MTUyNTM1NDU1NTY1NzU4NTk2MDYxNjI2MzY0NjU2NjY3Njg2OTcwNzE3MjczNzQ3NTc2Nzc3ODc5ODA4MTgyODM4NDg1ODY4Nzg4ODk5MDkxOTI5Mzk0OTU5Njk3OTg5OXR5cGUgPj0ga051bGxUeXBlICYmIHR5cGUgPD0ga051bWJlclR5cGUAR2VuZXJpY1ZhbHVlAEFkZE1lbWJlcgBNZW1iZXJSZXNlcnZlADZNeUpzb24AUDZNeUpzb24AUEs2TXlKc29uAGlpAHYAdmkATlN0M19fMjEyYmFzaWNfc3RyaW5nSWNOU18xMWNoYXJfdHJhaXRzSWNFRU5TXzlhbGxvY2F0b3JJY0VFRUUATlN0M19fMjIxX19iYXNpY19zdHJpbmdfY29tbW9uSUxiMUVFRQBpaWkAaWlpaQB2aWlpAHZpaWlpAHZvaWQAYm9vbABjaGFyAHNpZ25lZCBjaGFyAHVuc2lnbmVkIGNoYXIAc2hvcnQAdW5zaWduZWQgc2hvcnQAaW50AHVuc2lnbmVkIGludABsb25nAHVuc2lnbmVkIGxvbmcAZmxvYXQAZG91YmxlAHN0ZDo6c3RyaW5nAHN0ZDo6YmFzaWNfc3RyaW5nPHVuc2lnbmVkIGNoYXI+AHN0ZDo6d3N0cmluZwBlbXNjcmlwdGVuOjp2YWwAZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8Y2hhcj4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8c2lnbmVkIGNoYXI+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVuc2lnbmVkIGNoYXI+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHNob3J0PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1bnNpZ25lZCBzaG9ydD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1bnNpZ25lZCBpbnQ+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGxvbmc+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVuc2lnbmVkIGxvbmc+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGludDhfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dWludDhfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50MTZfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dWludDE2X3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGludDMyX3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVpbnQzMl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxmbG9hdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8ZG91YmxlPgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxsb25nIGRvdWJsZT4ATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJZUVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWRFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lmRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJbUVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWxFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lqRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJaUVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SXRFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lzRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJaEVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWFFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0ljRUUATjEwZW1zY3JpcHRlbjN2YWxFAE5TdDNfXzIxMmJhc2ljX3N0cmluZ0l3TlNfMTFjaGFyX3RyYWl0c0l3RUVOU185YWxsb2NhdG9ySXdFRUVFAE5TdDNfXzIxMmJhc2ljX3N0cmluZ0loTlNfMTFjaGFyX3RyYWl0c0loRUVOU185YWxsb2NhdG9ySWhFRUVFABEACgAREREAAAAABQAAAAAAAAkAAAAACwAAAAAAAAAAEQAPChEREQMKBwABEwkLCwAACQYLAAALAAYRAAAAERERAAAAAAAAAAAAAAAAAAAAAAsAAAAAAAAAABEACgoREREACgAAAgAJCwAAAAkACwAACwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAMAAAAAAwAAAAACQwAAAAAAAwAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAADQAAAAQNAAAAAAkOAAAAAAAOAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAA8AAAAADwAAAAAJEAAAAAAAEAAAEAAAEgAAABISEgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASAAAAEhISAAAAAAAACQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACwAAAAAAAAAAAAAACgAAAAAKAAAAAAkLAAAAAAALAAALAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAwAAAAADAAAAAAJDAAAAAAADAAADAAALSsgICAwWDB4AChudWxsKQAtMFgrMFggMFgtMHgrMHggMHgAaW5mAElORgBuYW4ATkFOADAxMjM0NTY3ODlBQkNERUYuAFQhIhkNAQIDEUscDBAECx0SHidobm9wcWIgBQYPExQVGggWBygkFxgJCg4bHyUjg4J9JiorPD0+P0NHSk1YWVpbXF1eX2BhY2RlZmdpamtscnN0eXp7fABJbGxlZ2FsIGJ5dGUgc2VxdWVuY2UARG9tYWluIGVycm9yAFJlc3VsdCBub3QgcmVwcmVzZW50YWJsZQBOb3QgYSB0dHkAUGVybWlzc2lvbiBkZW5pZWQAT3BlcmF0aW9uIG5vdCBwZXJtaXR0ZWQATm8gc3VjaCBmaWxlIG9yIGRpcmVjdG9yeQBObyBzdWNoIHByb2Nlc3MARmlsZSBleGlzdHMAVmFsdWUgdG9vIGxhcmdlIGZvciBkYXRhIHR5cGUATm8gc3BhY2UgbGVmdCBvbiBkZXZpY2UAT3V0IG9mIG1lbW9yeQBSZXNvdXJjZSBidXN5AEludGVycnVwdGVkIHN5c3RlbSBjYWxsAFJlc291cmNlIHRlbXBvcmFyaWx5IHVuYXZhaWxhYmxlAEludmFsaWQgc2VlawBDcm9zcy1kZXZpY2UgbGluawBSZWFkLW9ubHkgZmlsZSBzeXN0ZW0ARGlyZWN0b3J5IG5vdCBlbXB0eQBDb25uZWN0aW9uIHJlc2V0IGJ5IHBlZXIAT3BlcmF0aW9uIHRpbWVkIG91dABDb25uZWN0aW9uIHJlZnVzZWQASG9zdCBpcyBkb3duAEhvc3QgaXMgdW5yZWFjaGFibGUAQWRkcmVzcyBpbiB1c2UAQnJva2VuIHBpcGUASS9PIGVycm9yAE5vIHN1Y2ggZGV2aWNlIG9yIGFkZHJlc3MAQmxvY2sgZGV2aWNlIHJlcXVpcmVkAE5vIHN1Y2ggZGV2aWNlAE5vdCBhIGRpcmVjdG9yeQBJcyBhIGRpcmVjdG9yeQBUZXh0IGZpbGUgYnVzeQBFeGVjIGZvcm1hdCBlcnJvcgBJbnZhbGlkIGFyZ3VtZW50AEFyZ3VtZW50IGxpc3QgdG9vIGxvbmcAU3ltYm9saWMgbGluayBsb29wAEZpbGVuYW1lIHRvbyBsb25nAFRvbyBtYW55IG9wZW4gZmlsZXMgaW4gc3lzdGVtAE5vIGZpbGUgZGVzY3JpcHRvcnMgYXZhaWxhYmxlAEJhZCBmaWxlIGRlc2NyaXB0b3IATm8gY2hpbGQgcHJvY2VzcwBCYWQgYWRkcmVzcwBGaWxlIHRvbyBsYXJnZQBUb28gbWFueSBsaW5rcwBObyBsb2NrcyBhdmFpbGFibGUAUmVzb3VyY2UgZGVhZGxvY2sgd291bGQgb2NjdXIAU3RhdGUgbm90IHJlY292ZXJhYmxlAFByZXZpb3VzIG93bmVyIGRpZWQAT3BlcmF0aW9uIGNhbmNlbGVkAEZ1bmN0aW9uIG5vdCBpbXBsZW1lbnRlZABObyBtZXNzYWdlIG9mIGRlc2lyZWQgdHlwZQBJZGVudGlmaWVyIHJlbW92ZWQARGV2aWNlIG5vdCBhIHN0cmVhbQBObyBkYXRhIGF2YWlsYWJsZQBEZXZpY2UgdGltZW91dABPdXQgb2Ygc3RyZWFtcyByZXNvdXJjZXMATGluayBoYXMgYmVlbiBzZXZlcmVkAFByb3RvY29sIGVycm9yAEJhZCBtZXNzYWdlAEZpbGUgZGVzY3JpcHRvciBpbiBiYWQgc3RhdGUATm90IGEgc29ja2V0AERlc3RpbmF0aW9uIGFkZHJlc3MgcmVxdWlyZWQATWVzc2FnZSB0b28gbGFyZ2UAUHJvdG9jb2wgd3JvbmcgdHlwZSBmb3Igc29ja2V0AFByb3RvY29sIG5vdCBhdmFpbGFibGUAUHJvdG9jb2wgbm90IHN1cHBvcnRlZABTb2NrZXQgdHlwZSBub3Qgc3VwcG9ydGVkAE5vdCBzdXBwb3J0ZWQAUHJvdG9jb2wgZmFtaWx5IG5vdCBzdXBwb3J0ZWQAQWRkcmVzcyBmYW1pbHkgbm90IHN1cHBvcnRlZCBieSBwcm90b2NvbABBZGRyZXNzIG5vdCBhdmFpbGFibGUATmV0d29yayBpcyBkb3duAE5ldHdvcmsgdW5yZWFjaGFibGUAQ29ubmVjdGlvbiByZXNldCBieSBuZXR3b3JrAENvbm5lY3Rpb24gYWJvcnRlZABObyBidWZmZXIgc3BhY2UgYXZhaWxhYmxlAFNvY2tldCBpcyBjb25uZWN0ZWQAU29ja2V0IG5vdCBjb25uZWN0ZWQAQ2Fubm90IHNlbmQgYWZ0ZXIgc29ja2V0IHNodXRkb3duAE9wZXJhdGlvbiBhbHJlYWR5IGluIHByb2dyZXNzAE9wZXJhdGlvbiBpbiBwcm9ncmVzcwBTdGFsZSBmaWxlIGhhbmRsZQBSZW1vdGUgSS9PIGVycm9yAFF1b3RhIGV4Y2VlZGVkAE5vIG1lZGl1bSBmb3VuZABXcm9uZyBtZWRpdW0gdHlwZQBObyBlcnJvciBpbmZvcm1hdGlvbgAAYmFzaWNfc3RyaW5nAHRlcm1pbmF0aW5nIHdpdGggJXMgZXhjZXB0aW9uIG9mIHR5cGUgJXM6ICVzAHRlcm1pbmF0aW5nIHdpdGggJXMgZXhjZXB0aW9uIG9mIHR5cGUgJXMAdGVybWluYXRpbmcgd2l0aCAlcyBmb3JlaWduIGV4Y2VwdGlvbgB0ZXJtaW5hdGluZwB1bmNhdWdodABTdDlleGNlcHRpb24ATjEwX19jeHhhYml2MTE2X19zaGltX3R5cGVfaW5mb0UAU3Q5dHlwZV9pbmZvAE4xMF9fY3h4YWJpdjEyMF9fc2lfY2xhc3NfdHlwZV9pbmZvRQBOMTBfX2N4eGFiaXYxMTdfX2NsYXNzX3R5cGVfaW5mb0UAcHRocmVhZF9vbmNlIGZhaWx1cmUgaW4gX19jeGFfZ2V0X2dsb2JhbHNfZmFzdCgpAGNhbm5vdCBjcmVhdGUgcHRocmVhZCBrZXkgZm9yIF9fY3hhX2dldF9nbG9iYWxzKCkAY2Fubm90IHplcm8gb3V0IHRocmVhZCB2YWx1ZSBmb3IgX19jeGFfZ2V0X2dsb2JhbHMoKQB0ZXJtaW5hdGVfaGFuZGxlciB1bmV4cGVjdGVkbHkgcmV0dXJuZWQAdGVybWluYXRlX2hhbmRsZXIgdW5leHBlY3RlZGx5IHRocmV3IGFuIGV4Y2VwdGlvbgBzdGQ6OmJhZF9hbGxvYwBTdDliYWRfYWxsb2MAU3QxMWxvZ2ljX2Vycm9yAFN0MTJsZW5ndGhfZXJyb3IATjEwX19jeHhhYml2MTE5X19wb2ludGVyX3R5cGVfaW5mb0UATjEwX19jeHhhYml2MTE3X19wYmFzZV90eXBlX2luZm9FAE4xMF9fY3h4YWJpdjEyM19fZnVuZGFtZW50YWxfdHlwZV9pbmZvRQB2AERuAGIAYwBoAGEAcwB0AGkAagBsAG0AZgBkAE4xMF9fY3h4YWJpdjEyMV9fdm1pX2NsYXNzX3R5cGVfaW5mb0U=";





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  function ___assert_fail(condition, filename, line, func) {
      ABORT = true;
      throw 'Assertion failed: ' + Pointer_stringify(condition) + ', at: ' + [filename ? Pointer_stringify(filename) : 'unknown filename', line, func ? Pointer_stringify(func) : 'unknown function'] + ' at ' + stackTrace();
    }

  function ___cxa_allocate_exception(size) {
      return _malloc(size);
    }

  
  function __ZSt18uncaught_exceptionv() { // std::uncaught_exception()
      return !!__ZSt18uncaught_exceptionv.uncaught_exception;
    }
  
  var EXCEPTIONS={last:0,caught:[],infos:{},deAdjust:function (adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted;
        for (var ptr in EXCEPTIONS.infos) {
          var info = EXCEPTIONS.infos[ptr];
          if (info.adjusted === adjusted) {
            return ptr;
          }
        }
        return adjusted;
      },addRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++;
      },decRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        assert(info.refcount > 0);
        info.refcount--;
        // A rethrown exception can reach refcount 0; it must not be discarded
        // Its next handler will clear the rethrown flag and addRef it, prior to
        // final decRef and destruction here
        if (info.refcount === 0 && !info.rethrown) {
          if (info.destructor) {
            Module['dynCall_vi'](info.destructor, ptr);
          }
          delete EXCEPTIONS.infos[ptr];
          ___cxa_free_exception(ptr);
        }
      },clearRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0;
      }};function ___cxa_begin_catch(ptr) {
      var info = EXCEPTIONS.infos[ptr];
      if (info && !info.caught) {
        info.caught = true;
        __ZSt18uncaught_exceptionv.uncaught_exception--;
      }
      if (info) info.rethrown = false;
      EXCEPTIONS.caught.push(ptr);
      EXCEPTIONS.addRef(EXCEPTIONS.deAdjust(ptr));
      return ptr;
    }

  
  function ___cxa_free_exception(ptr) {
      try {
        return _free(ptr);
      } catch(e) { // XXX FIXME
        Module.printErr('exception during cxa_free_exception: ' + e);
      }
    }function ___cxa_end_catch() {
      // Clear state flag.
      Module['setThrew'](0);
      // Call destructor if one is registered then clear it.
      var ptr = EXCEPTIONS.caught.pop();
      if (ptr) {
        EXCEPTIONS.decRef(EXCEPTIONS.deAdjust(ptr));
        EXCEPTIONS.last = 0; // XXX in decRef?
      }
    }

  function ___cxa_find_matching_catch_2() {
          return ___cxa_find_matching_catch.apply(null, arguments);
        }

  function ___cxa_find_matching_catch_3() {
          return ___cxa_find_matching_catch.apply(null, arguments);
        }


  
  
  function ___resumeException(ptr) {
      if (!EXCEPTIONS.last) { EXCEPTIONS.last = ptr; }
      throw ptr;
    }function ___cxa_find_matching_catch() {
      var thrown = EXCEPTIONS.last;
      if (!thrown) {
        // just pass through the null ptr
        return ((Runtime.setTempRet0(0),0)|0);
      }
      var info = EXCEPTIONS.infos[thrown];
      var throwntype = info.type;
      if (!throwntype) {
        // just pass through the thrown ptr
        return ((Runtime.setTempRet0(0),thrown)|0);
      }
      var typeArray = Array.prototype.slice.call(arguments);
  
      var pointer = Module['___cxa_is_pointer_type'](throwntype);
      // can_catch receives a **, add indirection
      if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
      HEAP32[((___cxa_find_matching_catch.buffer)>>2)]=thrown;
      thrown = ___cxa_find_matching_catch.buffer;
      // The different catch blocks are denoted by different types.
      // Due to inheritance, those types may not precisely match the
      // type of the thrown object. Find one which matches, and
      // return the type of the catch block which should be called.
      for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module['___cxa_can_catch'](typeArray[i], throwntype, thrown)) {
          thrown = HEAP32[((thrown)>>2)]; // undo indirection
          info.adjusted = thrown;
          return ((Runtime.setTempRet0(typeArray[i]),thrown)|0);
        }
      }
      // Shouldn't happen unless we have bogus data in typeArray
      // or encounter a type for which emscripten doesn't have suitable
      // typeinfo defined. Best-efforts match just in case.
      thrown = HEAP32[((thrown)>>2)]; // undo indirection
      return ((Runtime.setTempRet0(throwntype),thrown)|0);
    }function ___cxa_throw(ptr, type, destructor) {
      EXCEPTIONS.infos[ptr] = {
        ptr: ptr,
        adjusted: ptr,
        type: type,
        destructor: destructor,
        refcount: 0,
        caught: false,
        rethrown: false
      };
      EXCEPTIONS.last = ptr;
      if (!("uncaught_exception" in __ZSt18uncaught_exceptionv)) {
        __ZSt18uncaught_exceptionv.uncaught_exception = 1;
      } else {
        __ZSt18uncaught_exceptionv.uncaught_exception++;
      }
      throw ptr;
    }

  function ___gxx_personality_v0() {
    }

  function ___lock() {}

  
    


  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      // NOTE: offset_high is unused - Emscripten's off_t is 32-bit
      var offset = offset_low;
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffer) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  
   
  
   
  
  var cttz_i8 = allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0], "i8", ALLOC_STATIC);   

  function ___unlock() {}

   

  
  function getShiftFromSize(size) {
      switch (size) {
          case 1: return 0;
          case 2: return 1;
          case 4: return 2;
          case 8: return 3;
          default:
              throw new TypeError('Unknown type size: ' + size);
      }
    }
  
  
  
  function embind_init_charCodes() {
      var codes = new Array(256);
      for (var i = 0; i < 256; ++i) {
          codes[i] = String.fromCharCode(i);
      }
      embind_charCodes = codes;
    }var embind_charCodes=undefined;function readLatin1String(ptr) {
      var ret = "";
      var c = ptr;
      while (HEAPU8[c]) {
          ret += embind_charCodes[HEAPU8[c++]];
      }
      return ret;
    }
  
  
  var awaitingDependencies={};
  
  var registeredTypes={};
  
  var typeDependencies={};
  
  
  
  
  
  
  var char_0=48;
  
  var char_9=57;function makeLegalFunctionName(name) {
      if (undefined === name) {
          return '_unknown';
      }
      name = name.replace(/[^a-zA-Z0-9_]/g, '$');
      var f = name.charCodeAt(0);
      if (f >= char_0 && f <= char_9) {
          return '_' + name;
      } else {
          return name;
      }
    }function createNamedFunction(name, body) {
      name = makeLegalFunctionName(name);
      /*jshint evil:true*/
      return new Function(
          "body",
          "return function " + name + "() {\n" +
          "    \"use strict\";" +
          "    return body.apply(this, arguments);\n" +
          "};\n"
      )(body);
    }function extendError(baseErrorType, errorName) {
      var errorClass = createNamedFunction(errorName, function(message) {
          this.name = errorName;
          this.message = message;
  
          var stack = (new Error(message)).stack;
          if (stack !== undefined) {
              this.stack = this.toString() + '\n' +
                  stack.replace(/^Error(:[^\n]*)?\n/, '');
          }
      });
      errorClass.prototype = Object.create(baseErrorType.prototype);
      errorClass.prototype.constructor = errorClass;
      errorClass.prototype.toString = function() {
          if (this.message === undefined) {
              return this.name;
          } else {
              return this.name + ': ' + this.message;
          }
      };
  
      return errorClass;
    }var BindingError=undefined;function throwBindingError(message) {
      throw new BindingError(message);
    }
  
  
  
  var InternalError=undefined;function throwInternalError(message) {
      throw new InternalError(message);
    }function whenDependentTypesAreResolved(myTypes, dependentTypes, getTypeConverters) {
      myTypes.forEach(function(type) {
          typeDependencies[type] = dependentTypes;
      });
  
      function onComplete(typeConverters) {
          var myTypeConverters = getTypeConverters(typeConverters);
          if (myTypeConverters.length !== myTypes.length) {
              throwInternalError('Mismatched type converter count');
          }
          for (var i = 0; i < myTypes.length; ++i) {
              registerType(myTypes[i], myTypeConverters[i]);
          }
      }
  
      var typeConverters = new Array(dependentTypes.length);
      var unregisteredTypes = [];
      var registered = 0;
      dependentTypes.forEach(function(dt, i) {
          if (registeredTypes.hasOwnProperty(dt)) {
              typeConverters[i] = registeredTypes[dt];
          } else {
              unregisteredTypes.push(dt);
              if (!awaitingDependencies.hasOwnProperty(dt)) {
                  awaitingDependencies[dt] = [];
              }
              awaitingDependencies[dt].push(function() {
                  typeConverters[i] = registeredTypes[dt];
                  ++registered;
                  if (registered === unregisteredTypes.length) {
                      onComplete(typeConverters);
                  }
              });
          }
      });
      if (0 === unregisteredTypes.length) {
          onComplete(typeConverters);
      }
    }function registerType(rawType, registeredInstance, options) {
      options = options || {};
  
      if (!('argPackAdvance' in registeredInstance)) {
          throw new TypeError('registerType registeredInstance requires argPackAdvance');
      }
  
      var name = registeredInstance.name;
      if (!rawType) {
          throwBindingError('type "' + name + '" must have a positive integer typeid pointer');
      }
      if (registeredTypes.hasOwnProperty(rawType)) {
          if (options.ignoreDuplicateRegistrations) {
              return;
          } else {
              throwBindingError("Cannot register type '" + name + "' twice");
          }
      }
  
      registeredTypes[rawType] = registeredInstance;
      delete typeDependencies[rawType];
  
      if (awaitingDependencies.hasOwnProperty(rawType)) {
          var callbacks = awaitingDependencies[rawType];
          delete awaitingDependencies[rawType];
          callbacks.forEach(function(cb) {
              cb();
          });
      }
    }function __embind_register_bool(rawType, name, size, trueValue, falseValue) {
      var shift = getShiftFromSize(size);
  
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(wt) {
              // ambiguous emscripten ABI: sometimes return values are
              // true or false, and sometimes integers (0 or 1)
              return !!wt;
          },
          'toWireType': function(destructors, o) {
              return o ? trueValue : falseValue;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': function(pointer) {
              // TODO: if heap is fixed (like in asm.js) this could be executed outside
              var heap;
              if (size === 1) {
                  heap = HEAP8;
              } else if (size === 2) {
                  heap = HEAP16;
              } else if (size === 4) {
                  heap = HEAP32;
              } else {
                  throw new TypeError("Unknown boolean type size: " + name);
              }
              return this['fromWireType'](heap[pointer >> shift]);
          },
          destructorFunction: null, // This type does not need a destructor
      });
    }

  
  
  
  function ClassHandle_isAliasOf(other) {
      if (!(this instanceof ClassHandle)) {
          return false;
      }
      if (!(other instanceof ClassHandle)) {
          return false;
      }
  
      var leftClass = this.$$.ptrType.registeredClass;
      var left = this.$$.ptr;
      var rightClass = other.$$.ptrType.registeredClass;
      var right = other.$$.ptr;
  
      while (leftClass.baseClass) {
          left = leftClass.upcast(left);
          leftClass = leftClass.baseClass;
      }
  
      while (rightClass.baseClass) {
          right = rightClass.upcast(right);
          rightClass = rightClass.baseClass;
      }
  
      return leftClass === rightClass && left === right;
    }
  
  
  function shallowCopyInternalPointer(o) {
      return {
          count: o.count,
          deleteScheduled: o.deleteScheduled,
          preservePointerOnDelete: o.preservePointerOnDelete,
          ptr: o.ptr,
          ptrType: o.ptrType,
          smartPtr: o.smartPtr,
          smartPtrType: o.smartPtrType,
      };
    }
  
  function throwInstanceAlreadyDeleted(obj) {
      function getInstanceTypeName(handle) {
        return handle.$$.ptrType.registeredClass.name;
      }
      throwBindingError(getInstanceTypeName(obj) + ' instance already deleted');
    }function ClassHandle_clone() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
  
      if (this.$$.preservePointerOnDelete) {
          this.$$.count.value += 1;
          return this;
      } else {
          var clone = Object.create(Object.getPrototypeOf(this), {
              $$: {
                  value: shallowCopyInternalPointer(this.$$),
              }
          });
  
          clone.$$.count.value += 1;
          clone.$$.deleteScheduled = false;
          return clone;
      }
    }
  
  
  function runDestructor(handle) {
      var $$ = handle.$$;
      if ($$.smartPtr) {
          $$.smartPtrType.rawDestructor($$.smartPtr);
      } else {
          $$.ptrType.registeredClass.rawDestructor($$.ptr);
      }
    }function ClassHandle_delete() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
  
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
          throwBindingError('Object already scheduled for deletion');
      }
  
      this.$$.count.value -= 1;
      var toDelete = 0 === this.$$.count.value;
      if (toDelete) {
          runDestructor(this);
      }
      if (!this.$$.preservePointerOnDelete) {
          this.$$.smartPtr = undefined;
          this.$$.ptr = undefined;
      }
    }
  
  function ClassHandle_isDeleted() {
      return !this.$$.ptr;
    }
  
  
  var delayFunction=undefined;
  
  var deletionQueue=[];
  
  function flushPendingDeletes() {
      while (deletionQueue.length) {
          var obj = deletionQueue.pop();
          obj.$$.deleteScheduled = false;
          obj['delete']();
      }
    }function ClassHandle_deleteLater() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
          throwBindingError('Object already scheduled for deletion');
      }
      deletionQueue.push(this);
      if (deletionQueue.length === 1 && delayFunction) {
          delayFunction(flushPendingDeletes);
      }
      this.$$.deleteScheduled = true;
      return this;
    }function init_ClassHandle() {
      ClassHandle.prototype['isAliasOf'] = ClassHandle_isAliasOf;
      ClassHandle.prototype['clone'] = ClassHandle_clone;
      ClassHandle.prototype['delete'] = ClassHandle_delete;
      ClassHandle.prototype['isDeleted'] = ClassHandle_isDeleted;
      ClassHandle.prototype['deleteLater'] = ClassHandle_deleteLater;
    }function ClassHandle() {
    }
  
  var registeredPointers={};
  
  
  function ensureOverloadTable(proto, methodName, humanName) {
      if (undefined === proto[methodName].overloadTable) {
          var prevFunc = proto[methodName];
          // Inject an overload resolver function that routes to the appropriate overload based on the number of arguments.
          proto[methodName] = function() {
              // TODO This check can be removed in -O3 level "unsafe" optimizations.
              if (!proto[methodName].overloadTable.hasOwnProperty(arguments.length)) {
                  throwBindingError("Function '" + humanName + "' called with an invalid number of arguments (" + arguments.length + ") - expects one of (" + proto[methodName].overloadTable + ")!");
              }
              return proto[methodName].overloadTable[arguments.length].apply(this, arguments);
          };
          // Move the previous function into the overload table.
          proto[methodName].overloadTable = [];
          proto[methodName].overloadTable[prevFunc.argCount] = prevFunc;
      }
    }function exposePublicSymbol(name, value, numArguments) {
      if (Module.hasOwnProperty(name)) {
          if (undefined === numArguments || (undefined !== Module[name].overloadTable && undefined !== Module[name].overloadTable[numArguments])) {
              throwBindingError("Cannot register public name '" + name + "' twice");
          }
  
          // We are exposing a function with the same name as an existing function. Create an overload table and a function selector
          // that routes between the two.
          ensureOverloadTable(Module, name, name);
          if (Module.hasOwnProperty(numArguments)) {
              throwBindingError("Cannot register multiple overloads of a function with the same number of arguments (" + numArguments + ")!");
          }
          // Add the new function into the overload table.
          Module[name].overloadTable[numArguments] = value;
      }
      else {
          Module[name] = value;
          if (undefined !== numArguments) {
              Module[name].numArguments = numArguments;
          }
      }
    }
  
  function RegisteredClass(
      name,
      constructor,
      instancePrototype,
      rawDestructor,
      baseClass,
      getActualType,
      upcast,
      downcast
    ) {
      this.name = name;
      this.constructor = constructor;
      this.instancePrototype = instancePrototype;
      this.rawDestructor = rawDestructor;
      this.baseClass = baseClass;
      this.getActualType = getActualType;
      this.upcast = upcast;
      this.downcast = downcast;
      this.pureVirtualFunctions = [];
    }
  
  
  
  function upcastPointer(ptr, ptrClass, desiredClass) {
      while (ptrClass !== desiredClass) {
          if (!ptrClass.upcast) {
              throwBindingError("Expected null or instance of " + desiredClass.name + ", got an instance of " + ptrClass.name);
          }
          ptr = ptrClass.upcast(ptr);
          ptrClass = ptrClass.baseClass;
      }
      return ptr;
    }function constNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
          return 0;
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
  
  function genericPointerToWireType(destructors, handle) {
      var ptr;
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
  
          if (this.isSmartPointer) {
              ptr = this.rawConstructor();
              if (destructors !== null) {
                  destructors.push(this.rawDestructor, ptr);
              }
              return ptr;
          } else {
              return 0;
          }
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      if (!this.isConst && handle.$$.ptrType.isConst) {
          throwBindingError('Cannot convert argument of type ' + (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) + ' to parameter type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
  
      if (this.isSmartPointer) {
          // TODO: this is not strictly true
          // We could support BY_EMVAL conversions from raw pointers to smart pointers
          // because the smart pointer can hold a reference to the handle
          if (undefined === handle.$$.smartPtr) {
              throwBindingError('Passing raw pointer to smart pointer is illegal');
          }
  
          switch (this.sharingPolicy) {
              case 0: // NONE
                  // no upcasting
                  if (handle.$$.smartPtrType === this) {
                      ptr = handle.$$.smartPtr;
                  } else {
                      throwBindingError('Cannot convert argument of type ' + (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) + ' to parameter type ' + this.name);
                  }
                  break;
  
              case 1: // INTRUSIVE
                  ptr = handle.$$.smartPtr;
                  break;
  
              case 2: // BY_EMVAL
                  if (handle.$$.smartPtrType === this) {
                      ptr = handle.$$.smartPtr;
                  } else {
                      var clonedHandle = handle['clone']();
                      ptr = this.rawShare(
                          ptr,
                          __emval_register(function() {
                              clonedHandle['delete']();
                          })
                      );
                      if (destructors !== null) {
                          destructors.push(this.rawDestructor, ptr);
                      }
                  }
                  break;
  
              default:
                  throwBindingError('Unsupporting sharing policy');
          }
      }
      return ptr;
    }
  
  function nonConstNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
          return 0;
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      if (handle.$$.ptrType.isConst) {
          throwBindingError('Cannot convert argument of type ' + handle.$$.ptrType.name + ' to parameter type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
  
  
  function simpleReadValueFromPointer(pointer) {
      return this['fromWireType'](HEAPU32[pointer >> 2]);
    }
  
  function RegisteredPointer_getPointee(ptr) {
      if (this.rawGetPointee) {
          ptr = this.rawGetPointee(ptr);
      }
      return ptr;
    }
  
  function RegisteredPointer_destructor(ptr) {
      if (this.rawDestructor) {
          this.rawDestructor(ptr);
      }
    }
  
  function RegisteredPointer_deleteObject(handle) {
      if (handle !== null) {
          handle['delete']();
      }
    }
  
  
  function downcastPointer(ptr, ptrClass, desiredClass) {
      if (ptrClass === desiredClass) {
          return ptr;
      }
      if (undefined === desiredClass.baseClass) {
          return null; // no conversion
      }
  
      var rv = downcastPointer(ptr, ptrClass, desiredClass.baseClass);
      if (rv === null) {
          return null;
      }
      return desiredClass.downcast(rv);
    }
  
  
  
  
  function getInheritedInstanceCount() {
      return Object.keys(registeredInstances).length;
    }
  
  function getLiveInheritedInstances() {
      var rv = [];
      for (var k in registeredInstances) {
          if (registeredInstances.hasOwnProperty(k)) {
              rv.push(registeredInstances[k]);
          }
      }
      return rv;
    }
  
  function setDelayFunction(fn) {
      delayFunction = fn;
      if (deletionQueue.length && delayFunction) {
          delayFunction(flushPendingDeletes);
      }
    }function init_embind() {
      Module['getInheritedInstanceCount'] = getInheritedInstanceCount;
      Module['getLiveInheritedInstances'] = getLiveInheritedInstances;
      Module['flushPendingDeletes'] = flushPendingDeletes;
      Module['setDelayFunction'] = setDelayFunction;
    }var registeredInstances={};
  
  function getBasestPointer(class_, ptr) {
      if (ptr === undefined) {
          throwBindingError('ptr should not be undefined');
      }
      while (class_.baseClass) {
          ptr = class_.upcast(ptr);
          class_ = class_.baseClass;
      }
      return ptr;
    }function getInheritedInstance(class_, ptr) {
      ptr = getBasestPointer(class_, ptr);
      return registeredInstances[ptr];
    }
  
  function makeClassHandle(prototype, record) {
      if (!record.ptrType || !record.ptr) {
          throwInternalError('makeClassHandle requires ptr and ptrType');
      }
      var hasSmartPtrType = !!record.smartPtrType;
      var hasSmartPtr = !!record.smartPtr;
      if (hasSmartPtrType !== hasSmartPtr) {
          throwInternalError('Both smartPtrType and smartPtr must be specified');
      }
      record.count = { value: 1 };
      return Object.create(prototype, {
          $$: {
              value: record,
          },
      });
    }function RegisteredPointer_fromWireType(ptr) {
      // ptr is a raw pointer (or a raw smartpointer)
  
      // rawPointer is a maybe-null raw pointer
      var rawPointer = this.getPointee(ptr);
      if (!rawPointer) {
          this.destructor(ptr);
          return null;
      }
  
      var registeredInstance = getInheritedInstance(this.registeredClass, rawPointer);
      if (undefined !== registeredInstance) {
          // JS object has been neutered, time to repopulate it
          if (0 === registeredInstance.$$.count.value) {
              registeredInstance.$$.ptr = rawPointer;
              registeredInstance.$$.smartPtr = ptr;
              return registeredInstance['clone']();
          } else {
              // else, just increment reference count on existing object
              // it already has a reference to the smart pointer
              var rv = registeredInstance['clone']();
              this.destructor(ptr);
              return rv;
          }
      }
  
      function makeDefaultHandle() {
          if (this.isSmartPointer) {
              return makeClassHandle(this.registeredClass.instancePrototype, {
                  ptrType: this.pointeeType,
                  ptr: rawPointer,
                  smartPtrType: this,
                  smartPtr: ptr,
              });
          } else {
              return makeClassHandle(this.registeredClass.instancePrototype, {
                  ptrType: this,
                  ptr: ptr,
              });
          }
      }
  
      var actualType = this.registeredClass.getActualType(rawPointer);
      var registeredPointerRecord = registeredPointers[actualType];
      if (!registeredPointerRecord) {
          return makeDefaultHandle.call(this);
      }
  
      var toType;
      if (this.isConst) {
          toType = registeredPointerRecord.constPointerType;
      } else {
          toType = registeredPointerRecord.pointerType;
      }
      var dp = downcastPointer(
          rawPointer,
          this.registeredClass,
          toType.registeredClass);
      if (dp === null) {
          return makeDefaultHandle.call(this);
      }
      if (this.isSmartPointer) {
          return makeClassHandle(toType.registeredClass.instancePrototype, {
              ptrType: toType,
              ptr: dp,
              smartPtrType: this,
              smartPtr: ptr,
          });
      } else {
          return makeClassHandle(toType.registeredClass.instancePrototype, {
              ptrType: toType,
              ptr: dp,
          });
      }
    }function init_RegisteredPointer() {
      RegisteredPointer.prototype.getPointee = RegisteredPointer_getPointee;
      RegisteredPointer.prototype.destructor = RegisteredPointer_destructor;
      RegisteredPointer.prototype['argPackAdvance'] = 8;
      RegisteredPointer.prototype['readValueFromPointer'] = simpleReadValueFromPointer;
      RegisteredPointer.prototype['deleteObject'] = RegisteredPointer_deleteObject;
      RegisteredPointer.prototype['fromWireType'] = RegisteredPointer_fromWireType;
    }function RegisteredPointer(
      name,
      registeredClass,
      isReference,
      isConst,
  
      // smart pointer properties
      isSmartPointer,
      pointeeType,
      sharingPolicy,
      rawGetPointee,
      rawConstructor,
      rawShare,
      rawDestructor
    ) {
      this.name = name;
      this.registeredClass = registeredClass;
      this.isReference = isReference;
      this.isConst = isConst;
  
      // smart pointer properties
      this.isSmartPointer = isSmartPointer;
      this.pointeeType = pointeeType;
      this.sharingPolicy = sharingPolicy;
      this.rawGetPointee = rawGetPointee;
      this.rawConstructor = rawConstructor;
      this.rawShare = rawShare;
      this.rawDestructor = rawDestructor;
  
      if (!isSmartPointer && registeredClass.baseClass === undefined) {
          if (isConst) {
              this['toWireType'] = constNoSmartPtrRawPointerToWireType;
              this.destructorFunction = null;
          } else {
              this['toWireType'] = nonConstNoSmartPtrRawPointerToWireType;
              this.destructorFunction = null;
          }
      } else {
          this['toWireType'] = genericPointerToWireType;
          // Here we must leave this.destructorFunction undefined, since whether genericPointerToWireType returns
          // a pointer that needs to be freed up is runtime-dependent, and cannot be evaluated at registration time.
          // TODO: Create an alternative mechanism that allows removing the use of var destructors = []; array in
          //       craftInvokerFunction altogether.
      }
    }
  
  function replacePublicSymbol(name, value, numArguments) {
      if (!Module.hasOwnProperty(name)) {
          throwInternalError('Replacing nonexistant public symbol');
      }
      // If there's an overload table for this symbol, replace the symbol in the overload table instead.
      if (undefined !== Module[name].overloadTable && undefined !== numArguments) {
          Module[name].overloadTable[numArguments] = value;
      }
      else {
          Module[name] = value;
          Module[name].argCount = numArguments;
      }
    }
  
  function requireFunction(signature, rawFunction) {
      signature = readLatin1String(signature);
  
      function makeDynCaller(dynCall) {
          var args = [];
          for (var i = 1; i < signature.length; ++i) {
              args.push('a' + i);
          }
  
          var name = 'dynCall_' + signature + '_' + rawFunction;
          var body = 'return function ' + name + '(' + args.join(', ') + ') {\n';
          body    += '    return dynCall(rawFunction' + (args.length ? ', ' : '') + args.join(', ') + ');\n';
          body    += '};\n';
  
          return (new Function('dynCall', 'rawFunction', body))(dynCall, rawFunction);
      }
  
      var fp;
      if (Module['FUNCTION_TABLE_' + signature] !== undefined) {
          fp = Module['FUNCTION_TABLE_' + signature][rawFunction];
      } else if (typeof FUNCTION_TABLE !== "undefined") {
          fp = FUNCTION_TABLE[rawFunction];
      } else {
          // asm.js does not give direct access to the function tables,
          // and thus we must go through the dynCall interface which allows
          // calling into a signature's function table by pointer value.
          //
          // https://github.com/dherman/asm.js/issues/83
          //
          // This has three main penalties:
          // - dynCall is another function call in the path from JavaScript to C++.
          // - JITs may not predict through the function table indirection at runtime.
          var dc = Module["asm"]['dynCall_' + signature];
          if (dc === undefined) {
              // We will always enter this branch if the signature
              // contains 'f' and PRECISE_F32 is not enabled.
              //
              // Try again, replacing 'f' with 'd'.
              dc = Module["asm"]['dynCall_' + signature.replace(/f/g, 'd')];
              if (dc === undefined) {
                  throwBindingError("No dynCall invoker for signature: " + signature);
              }
          }
          fp = makeDynCaller(dc);
      }
  
      if (typeof fp !== "function") {
          throwBindingError("unknown function pointer with signature " + signature + ": " + rawFunction);
      }
      return fp;
    }
  
  
  var UnboundTypeError=undefined;
  
  function getTypeName(type) {
      var ptr = ___getTypeName(type);
      var rv = readLatin1String(ptr);
      _free(ptr);
      return rv;
    }function throwUnboundTypeError(message, types) {
      var unboundTypes = [];
      var seen = {};
      function visit(type) {
          if (seen[type]) {
              return;
          }
          if (registeredTypes[type]) {
              return;
          }
          if (typeDependencies[type]) {
              typeDependencies[type].forEach(visit);
              return;
          }
          unboundTypes.push(type);
          seen[type] = true;
      }
      types.forEach(visit);
  
      throw new UnboundTypeError(message + ': ' + unboundTypes.map(getTypeName).join([', ']));
    }function __embind_register_class(
      rawType,
      rawPointerType,
      rawConstPointerType,
      baseClassRawType,
      getActualTypeSignature,
      getActualType,
      upcastSignature,
      upcast,
      downcastSignature,
      downcast,
      name,
      destructorSignature,
      rawDestructor
    ) {
      name = readLatin1String(name);
      getActualType = requireFunction(getActualTypeSignature, getActualType);
      if (upcast) {
          upcast = requireFunction(upcastSignature, upcast);
      }
      if (downcast) {
          downcast = requireFunction(downcastSignature, downcast);
      }
      rawDestructor = requireFunction(destructorSignature, rawDestructor);
      var legalFunctionName = makeLegalFunctionName(name);
  
      exposePublicSymbol(legalFunctionName, function() {
          // this code cannot run if baseClassRawType is zero
          throwUnboundTypeError('Cannot construct ' + name + ' due to unbound types', [baseClassRawType]);
      });
  
      whenDependentTypesAreResolved(
          [rawType, rawPointerType, rawConstPointerType],
          baseClassRawType ? [baseClassRawType] : [],
          function(base) {
              base = base[0];
  
              var baseClass;
              var basePrototype;
              if (baseClassRawType) {
                  baseClass = base.registeredClass;
                  basePrototype = baseClass.instancePrototype;
              } else {
                  basePrototype = ClassHandle.prototype;
              }
  
              var constructor = createNamedFunction(legalFunctionName, function() {
                  if (Object.getPrototypeOf(this) !== instancePrototype) {
                      throw new BindingError("Use 'new' to construct " + name);
                  }
                  if (undefined === registeredClass.constructor_body) {
                      throw new BindingError(name + " has no accessible constructor");
                  }
                  var body = registeredClass.constructor_body[arguments.length];
                  if (undefined === body) {
                      throw new BindingError("Tried to invoke ctor of " + name + " with invalid number of parameters (" + arguments.length + ") - expected (" + Object.keys(registeredClass.constructor_body).toString() + ") parameters instead!");
                  }
                  return body.apply(this, arguments);
              });
  
              var instancePrototype = Object.create(basePrototype, {
                  constructor: { value: constructor },
              });
  
              constructor.prototype = instancePrototype;
  
              var registeredClass = new RegisteredClass(
                  name,
                  constructor,
                  instancePrototype,
                  rawDestructor,
                  baseClass,
                  getActualType,
                  upcast,
                  downcast);
  
              var referenceConverter = new RegisteredPointer(
                  name,
                  registeredClass,
                  true,
                  false,
                  false);
  
              var pointerConverter = new RegisteredPointer(
                  name + '*',
                  registeredClass,
                  false,
                  false,
                  false);
  
              var constPointerConverter = new RegisteredPointer(
                  name + ' const*',
                  registeredClass,
                  false,
                  true,
                  false);
  
              registeredPointers[rawType] = {
                  pointerType: pointerConverter,
                  constPointerType: constPointerConverter
              };
  
              replacePublicSymbol(legalFunctionName, constructor);
  
              return [referenceConverter, pointerConverter, constPointerConverter];
          }
      );
    }

  
  function heap32VectorToArray(count, firstElement) {
      var array = [];
      for (var i = 0; i < count; i++) {
          array.push(HEAP32[(firstElement >> 2) + i]);
      }
      return array;
    }
  
  function runDestructors(destructors) {
      while (destructors.length) {
          var ptr = destructors.pop();
          var del = destructors.pop();
          del(ptr);
      }
    }function __embind_register_class_constructor(
      rawClassType,
      argCount,
      rawArgTypesAddr,
      invokerSignature,
      invoker,
      rawConstructor
    ) {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      invoker = requireFunction(invokerSignature, invoker);
  
      whenDependentTypesAreResolved([], [rawClassType], function(classType) {
          classType = classType[0];
          var humanName = 'constructor ' + classType.name;
  
          if (undefined === classType.registeredClass.constructor_body) {
              classType.registeredClass.constructor_body = [];
          }
          if (undefined !== classType.registeredClass.constructor_body[argCount - 1]) {
              throw new BindingError("Cannot register multiple constructors with identical number of parameters (" + (argCount-1) + ") for class '" + classType.name + "'! Overload resolution is currently only performed using the parameter count, not actual type info!");
          }
          classType.registeredClass.constructor_body[argCount - 1] = function unboundTypeHandler() {
              throwUnboundTypeError('Cannot construct ' + classType.name + ' due to unbound types', rawArgTypes);
          };
  
          whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
              classType.registeredClass.constructor_body[argCount - 1] = function constructor_body() {
                  if (arguments.length !== argCount - 1) {
                      throwBindingError(humanName + ' called with ' + arguments.length + ' arguments, expected ' + (argCount-1));
                  }
                  var destructors = [];
                  var args = new Array(argCount);
                  args[0] = rawConstructor;
                  for (var i = 1; i < argCount; ++i) {
                      args[i] = argTypes[i]['toWireType'](destructors, arguments[i - 1]);
                  }
  
                  var ptr = invoker.apply(null, args);
                  runDestructors(destructors);
  
                  return argTypes[0]['fromWireType'](ptr);
              };
              return [];
          });
          return [];
      });
    }

  
  
  function new_(constructor, argumentList) {
      if (!(constructor instanceof Function)) {
          throw new TypeError('new_ called with constructor type ' + typeof(constructor) + " which is not a function");
      }
  
      /*
       * Previously, the following line was just:
  
       function dummy() {};
  
       * Unfortunately, Chrome was preserving 'dummy' as the object's name, even though at creation, the 'dummy' has the
       * correct constructor name.  Thus, objects created with IMVU.new would show up in the debugger as 'dummy', which
       * isn't very helpful.  Using IMVU.createNamedFunction addresses the issue.  Doublely-unfortunately, there's no way
       * to write a test for this behavior.  -NRD 2013.02.22
       */
      var dummy = createNamedFunction(constructor.name || 'unknownFunctionName', function(){});
      dummy.prototype = constructor.prototype;
      var obj = new dummy;
  
      var r = constructor.apply(obj, argumentList);
      return (r instanceof Object) ? r : obj;
    }function craftInvokerFunction(humanName, argTypes, classType, cppInvokerFunc, cppTargetFunc) {
      // humanName: a human-readable string name for the function to be generated.
      // argTypes: An array that contains the embind type objects for all types in the function signature.
      //    argTypes[0] is the type object for the function return value.
      //    argTypes[1] is the type object for function this object/class type, or null if not crafting an invoker for a class method.
      //    argTypes[2...] are the actual function parameters.
      // classType: The embind type object for the class to be bound, or null if this is not a method of a class.
      // cppInvokerFunc: JS Function object to the C++-side function that interops into C++ code.
      // cppTargetFunc: Function pointer (an integer to FUNCTION_TABLE) to the target C++ function the cppInvokerFunc will end up calling.
      var argCount = argTypes.length;
  
      if (argCount < 2) {
          throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!");
      }
  
      var isClassMethodFunc = (argTypes[1] !== null && classType !== null);
  
      // Free functions with signature "void function()" do not need an invoker that marshalls between wire types.
  // TODO: This omits argument count check - enable only at -O3 or similar.
  //    if (ENABLE_UNSAFE_OPTS && argCount == 2 && argTypes[0].name == "void" && !isClassMethodFunc) {
  //       return FUNCTION_TABLE[fn];
  //    }
  
  
      // Determine if we need to use a dynamic stack to store the destructors for the function parameters.
      // TODO: Remove this completely once all function invokers are being dynamically generated.
      var needsDestructorStack = false;
  
      for(var i = 1; i < argTypes.length; ++i) { // Skip return value at index 0 - it's not deleted here.
          if (argTypes[i] !== null && argTypes[i].destructorFunction === undefined) { // The type does not define a destructor function - must use dynamic stack
              needsDestructorStack = true;
              break;
          }
      }
  
      var returns = (argTypes[0].name !== "void");
  
      var argsList = "";
      var argsListWired = "";
      for(var i = 0; i < argCount - 2; ++i) {
          argsList += (i!==0?", ":"")+"arg"+i;
          argsListWired += (i!==0?", ":"")+"arg"+i+"Wired";
      }
  
      var invokerFnBody =
          "return function "+makeLegalFunctionName(humanName)+"("+argsList+") {\n" +
          "if (arguments.length !== "+(argCount - 2)+") {\n" +
              "throwBindingError('function "+humanName+" called with ' + arguments.length + ' arguments, expected "+(argCount - 2)+" args!');\n" +
          "}\n";
  
  
      if (needsDestructorStack) {
          invokerFnBody +=
              "var destructors = [];\n";
      }
  
      var dtorStack = needsDestructorStack ? "destructors" : "null";
      var args1 = ["throwBindingError", "invoker", "fn", "runDestructors", "retType", "classParam"];
      var args2 = [throwBindingError, cppInvokerFunc, cppTargetFunc, runDestructors, argTypes[0], argTypes[1]];
  
  
      if (isClassMethodFunc) {
          invokerFnBody += "var thisWired = classParam.toWireType("+dtorStack+", this);\n";
      }
  
      for(var i = 0; i < argCount - 2; ++i) {
          invokerFnBody += "var arg"+i+"Wired = argType"+i+".toWireType("+dtorStack+", arg"+i+"); // "+argTypes[i+2].name+"\n";
          args1.push("argType"+i);
          args2.push(argTypes[i+2]);
      }
  
      if (isClassMethodFunc) {
          argsListWired = "thisWired" + (argsListWired.length > 0 ? ", " : "") + argsListWired;
      }
  
      invokerFnBody +=
          (returns?"var rv = ":"") + "invoker(fn"+(argsListWired.length>0?", ":"")+argsListWired+");\n";
  
      if (needsDestructorStack) {
          invokerFnBody += "runDestructors(destructors);\n";
      } else {
          for(var i = isClassMethodFunc?1:2; i < argTypes.length; ++i) { // Skip return value at index 0 - it's not deleted here. Also skip class type if not a method.
              var paramName = (i === 1 ? "thisWired" : ("arg"+(i - 2)+"Wired"));
              if (argTypes[i].destructorFunction !== null) {
                  invokerFnBody += paramName+"_dtor("+paramName+"); // "+argTypes[i].name+"\n";
                  args1.push(paramName+"_dtor");
                  args2.push(argTypes[i].destructorFunction);
              }
          }
      }
  
      if (returns) {
          invokerFnBody += "var ret = retType.fromWireType(rv);\n" +
                           "return ret;\n";
      } else {
      }
      invokerFnBody += "}\n";
  
      args1.push(invokerFnBody);
  
      var invokerFunction = new_(Function, args1).apply(null, args2);
      return invokerFunction;
    }function __embind_register_class_function(
      rawClassType,
      methodName,
      argCount,
      rawArgTypesAddr, // [ReturnType, ThisType, Args...]
      invokerSignature,
      rawInvoker,
      context,
      isPureVirtual
    ) {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      methodName = readLatin1String(methodName);
      rawInvoker = requireFunction(invokerSignature, rawInvoker);
  
      whenDependentTypesAreResolved([], [rawClassType], function(classType) {
          classType = classType[0];
          var humanName = classType.name + '.' + methodName;
  
          if (isPureVirtual) {
              classType.registeredClass.pureVirtualFunctions.push(methodName);
          }
  
          function unboundTypesHandler() {
              throwUnboundTypeError('Cannot call ' + humanName + ' due to unbound types', rawArgTypes);
          }
  
          var proto = classType.registeredClass.instancePrototype;
          var method = proto[methodName];
          if (undefined === method || (undefined === method.overloadTable && method.className !== classType.name && method.argCount === argCount - 2)) {
              // This is the first overload to be registered, OR we are replacing a function in the base class with a function in the derived class.
              unboundTypesHandler.argCount = argCount - 2;
              unboundTypesHandler.className = classType.name;
              proto[methodName] = unboundTypesHandler;
          } else {
              // There was an existing function with the same name registered. Set up a function overload routing table.
              ensureOverloadTable(proto, methodName, humanName);
              proto[methodName].overloadTable[argCount - 2] = unboundTypesHandler;
          }
  
          whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
  
              var memberFunction = craftInvokerFunction(humanName, argTypes, classType, rawInvoker, context);
  
              // Replace the initial unbound-handler-stub function with the appropriate member function, now that all types
              // are resolved. If multiple overloads are registered for this function, the function goes into an overload table.
              if (undefined === proto[methodName].overloadTable) {
                  // Set argCount in case an overload is registered later
                  memberFunction.argCount = argCount - 2;
                  proto[methodName] = memberFunction;
              } else {
                  proto[methodName].overloadTable[argCount - 2] = memberFunction;
              }
  
              return [];
          });
          return [];
      });
    }

  
  
  var emval_free_list=[];
  
  var emval_handle_array=[{},{value:undefined},{value:null},{value:true},{value:false}];function __emval_decref(handle) {
      if (handle > 4 && 0 === --emval_handle_array[handle].refcount) {
          emval_handle_array[handle] = undefined;
          emval_free_list.push(handle);
      }
    }
  
  
  
  function count_emval_handles() {
      var count = 0;
      for (var i = 5; i < emval_handle_array.length; ++i) {
          if (emval_handle_array[i] !== undefined) {
              ++count;
          }
      }
      return count;
    }
  
  function get_first_emval() {
      for (var i = 5; i < emval_handle_array.length; ++i) {
          if (emval_handle_array[i] !== undefined) {
              return emval_handle_array[i];
          }
      }
      return null;
    }function init_emval() {
      Module['count_emval_handles'] = count_emval_handles;
      Module['get_first_emval'] = get_first_emval;
    }function __emval_register(value) {
  
      switch(value){
        case undefined :{ return 1; }
        case null :{ return 2; }
        case true :{ return 3; }
        case false :{ return 4; }
        default:{
          var handle = emval_free_list.length ?
              emval_free_list.pop() :
              emval_handle_array.length;
  
          emval_handle_array[handle] = {refcount: 1, value: value};
          return handle;
          }
        }
    }function __embind_register_emval(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(handle) {
              var rv = emval_handle_array[handle].value;
              __emval_decref(handle);
              return rv;
          },
          'toWireType': function(destructors, value) {
              return __emval_register(value);
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: null, // This type does not need a destructor
  
          // TODO: do we need a deleteObject here?  write a test where
          // emval is passed into JS via an interface
      });
    }

  
  function _embind_repr(v) {
      if (v === null) {
          return 'null';
      }
      var t = typeof v;
      if (t === 'object' || t === 'array' || t === 'function') {
          return v.toString();
      } else {
          return '' + v;
      }
    }
  
  function floatReadValueFromPointer(name, shift) {
      switch (shift) {
          case 2: return function(pointer) {
              return this['fromWireType'](HEAPF32[pointer >> 2]);
          };
          case 3: return function(pointer) {
              return this['fromWireType'](HEAPF64[pointer >> 3]);
          };
          default:
              throw new TypeError("Unknown float type: " + name);
      }
    }function __embind_register_float(rawType, name, size) {
      var shift = getShiftFromSize(size);
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              return value;
          },
          'toWireType': function(destructors, value) {
              // todo: Here we have an opportunity for -O3 level "unsafe" optimizations: we could
              // avoid the following if() and assume value is of proper type.
              if (typeof value !== "number" && typeof value !== "boolean") {
                  throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
              }
              return value;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': floatReadValueFromPointer(name, shift),
          destructorFunction: null, // This type does not need a destructor
      });
    }

  
  function integerReadValueFromPointer(name, shift, signed) {
      // integers are quite common, so generate very specialized functions
      switch (shift) {
          case 0: return signed ?
              function readS8FromPointer(pointer) { return HEAP8[pointer]; } :
              function readU8FromPointer(pointer) { return HEAPU8[pointer]; };
          case 1: return signed ?
              function readS16FromPointer(pointer) { return HEAP16[pointer >> 1]; } :
              function readU16FromPointer(pointer) { return HEAPU16[pointer >> 1]; };
          case 2: return signed ?
              function readS32FromPointer(pointer) { return HEAP32[pointer >> 2]; } :
              function readU32FromPointer(pointer) { return HEAPU32[pointer >> 2]; };
          default:
              throw new TypeError("Unknown integer type: " + name);
      }
    }function __embind_register_integer(primitiveType, name, size, minRange, maxRange) {
      name = readLatin1String(name);
      if (maxRange === -1) { // LLVM doesn't have signed and unsigned 32-bit types, so u32 literals come out as 'i32 -1'. Always treat those as max u32.
          maxRange = 4294967295;
      }
  
      var shift = getShiftFromSize(size);
  
      var fromWireType = function(value) {
          return value;
      };
  
      if (minRange === 0) {
          var bitshift = 32 - 8*size;
          fromWireType = function(value) {
              return (value << bitshift) >>> bitshift;
          };
      }
  
      var isUnsignedType = (name.indexOf('unsigned') != -1);
  
      registerType(primitiveType, {
          name: name,
          'fromWireType': fromWireType,
          'toWireType': function(destructors, value) {
              // todo: Here we have an opportunity for -O3 level "unsafe" optimizations: we could
              // avoid the following two if()s and assume value is of proper type.
              if (typeof value !== "number" && typeof value !== "boolean") {
                  throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
              }
              if (value < minRange || value > maxRange) {
                  throw new TypeError('Passing a number "' + _embind_repr(value) + '" from JS side to C/C++ side to an argument of type "' + name + '", which is outside the valid range [' + minRange + ', ' + maxRange + ']!');
              }
              return isUnsignedType ? (value >>> 0) : (value | 0);
          },
          'argPackAdvance': 8,
          'readValueFromPointer': integerReadValueFromPointer(name, shift, minRange !== 0),
          destructorFunction: null, // This type does not need a destructor
      });
    }

  function __embind_register_memory_view(rawType, dataTypeIndex, name) {
      var typeMapping = [
          Int8Array,
          Uint8Array,
          Int16Array,
          Uint16Array,
          Int32Array,
          Uint32Array,
          Float32Array,
          Float64Array,
      ];
  
      var TA = typeMapping[dataTypeIndex];
  
      function decodeMemoryView(handle) {
          handle = handle >> 2;
          var heap = HEAPU32;
          var size = heap[handle]; // in elements
          var data = heap[handle + 1]; // byte offset into emscripten heap
          return new TA(heap['buffer'], data, size);
      }
  
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': decodeMemoryView,
          'argPackAdvance': 8,
          'readValueFromPointer': decodeMemoryView,
      }, {
          ignoreDuplicateRegistrations: true,
      });
    }

  function __embind_register_std_string(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              var length = HEAPU32[value >> 2];
              var a = new Array(length);
              for (var i = 0; i < length; ++i) {
                  a[i] = String.fromCharCode(HEAPU8[value + 4 + i]);
              }
              _free(value);
              return a.join('');
          },
          'toWireType': function(destructors, value) {
              if (value instanceof ArrayBuffer) {
                  value = new Uint8Array(value);
              }
  
              function getTAElement(ta, index) {
                  return ta[index];
              }
              function getStringElement(string, index) {
                  return string.charCodeAt(index);
              }
              var getElement;
              if (value instanceof Uint8Array) {
                  getElement = getTAElement;
              } else if (value instanceof Uint8ClampedArray) {
                  getElement = getTAElement;
              } else if (value instanceof Int8Array) {
                  getElement = getTAElement;
              } else if (typeof value === 'string') {
                  getElement = getStringElement;
              } else {
                  throwBindingError('Cannot pass non-string to std::string');
              }
  
              // assumes 4-byte alignment
              var length = value.length;
              var ptr = _malloc(4 + length);
              HEAPU32[ptr >> 2] = length;
              for (var i = 0; i < length; ++i) {
                  var charCode = getElement(value, i);
                  if (charCode > 255) {
                      _free(ptr);
                      throwBindingError('String has UTF-16 code units that do not fit in 8 bits');
                  }
                  HEAPU8[ptr + 4 + i] = charCode;
              }
              if (destructors !== null) {
                  destructors.push(_free, ptr);
              }
              return ptr;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: function(ptr) { _free(ptr); },
      });
    }

  function __embind_register_std_wstring(rawType, charSize, name) {
      // nb. do not cache HEAPU16 and HEAPU32, they may be destroyed by enlargeMemory().
      name = readLatin1String(name);
      var getHeap, shift;
      if (charSize === 2) {
          getHeap = function() { return HEAPU16; };
          shift = 1;
      } else if (charSize === 4) {
          getHeap = function() { return HEAPU32; };
          shift = 2;
      }
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              var HEAP = getHeap();
              var length = HEAPU32[value >> 2];
              var a = new Array(length);
              var start = (value + 4) >> shift;
              for (var i = 0; i < length; ++i) {
                  a[i] = String.fromCharCode(HEAP[start + i]);
              }
              _free(value);
              return a.join('');
          },
          'toWireType': function(destructors, value) {
              // assumes 4-byte alignment
              var HEAP = getHeap();
              var length = value.length;
              var ptr = _malloc(4 + length * charSize);
              HEAPU32[ptr >> 2] = length;
              var start = (ptr + 4) >> shift;
              for (var i = 0; i < length; ++i) {
                  HEAP[start + i] = value.charCodeAt(i);
              }
              if (destructors !== null) {
                  destructors.push(_free, ptr);
              }
              return ptr;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: function(ptr) { _free(ptr); },
      });
    }

  function __embind_register_void(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          isVoid: true, // void return values can be optimized out sometimes
          name: name,
          'argPackAdvance': 0,
          'fromWireType': function() {
              return undefined;
          },
          'toWireType': function(destructors, o) {
              // TODO: assert if anything else is given?
              return undefined;
          },
      });
    }

  function _abort() {
      Module['abort']();
    }

   

   



   

   

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 

   

   

  
  var PTHREAD_SPECIFIC={};function _pthread_getspecific(key) {
      return PTHREAD_SPECIFIC[key] || 0;
    }

  
  var PTHREAD_SPECIFIC_NEXT_KEY=1;
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};function _pthread_key_create(key, destructor) {
      if (key == 0) {
        return ERRNO_CODES.EINVAL;
      }
      HEAP32[((key)>>2)]=PTHREAD_SPECIFIC_NEXT_KEY;
      // values start at 0
      PTHREAD_SPECIFIC[PTHREAD_SPECIFIC_NEXT_KEY] = 0;
      PTHREAD_SPECIFIC_NEXT_KEY++;
      return 0;
    }

  function _pthread_once(ptr, func) {
      if (!_pthread_once.seen) _pthread_once.seen = {};
      if (ptr in _pthread_once.seen) return;
      Module['dynCall_v'](func);
      _pthread_once.seen[ptr] = 1;
    }

  function _pthread_setspecific(key, value) {
      if (!(key in PTHREAD_SPECIFIC)) {
        return ERRNO_CODES.EINVAL;
      }
      PTHREAD_SPECIFIC[key] = value;
      return 0;
    }

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    } 
/* flush anything remaining in the buffer during shutdown */ __ATEXIT__.push(function() { var fflush = Module["_fflush"]; if (fflush) fflush(0); var printChar = ___syscall146.printChar; if (!printChar) return; var buffers = ___syscall146.buffers; if (buffers[1].length) printChar(1, 10); if (buffers[2].length) printChar(2, 10); });;
embind_init_charCodes();
BindingError = Module['BindingError'] = extendError(Error, 'BindingError');;
InternalError = Module['InternalError'] = extendError(Error, 'InternalError');;
init_ClassHandle();
init_RegisteredPointer();
init_embind();;
UnboundTypeError = Module['UnboundTypeError'] = extendError(Error, 'UnboundTypeError');;
init_emval();;
DYNAMICTOP_PTR = allocate(1, "i32", ALLOC_STATIC);

STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = Runtime.alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");

var ASSERTIONS = true;

// All functions here should be maybeExported from jsifier.js

/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      if (ASSERTIONS) {
        assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      }
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}


Module["intArrayFromString"] = intArrayFromString;
Module["intArrayToString"] = intArrayToString;
// All functions here should be maybeExported from jsifier.js

// Copied from https://github.com/strophe/strophejs/blob/e06d027/src/polyfills.js#L149

// This code was written by Tyler Akins and has been placed in the
// public domain.  It would be nice if you left this header intact.
// Base64 code from Tyler Akins -- http://rumkin.com

var keyStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

var decodeBase64 = typeof atob === 'function' ? atob : function (input) {
  /**
   * Decodes a base64 string.
   * @param {String} input The string to decode.
   */
  var output = '';
  var chr1, chr2, chr3;
  var enc1, enc2, enc3, enc4;
  var i = 0;
  // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
  input = input.replace(/[^A-Za-z0-9\+\/\=]/g, '');
  do {
    enc1 = keyStr.indexOf(input.charAt(i++));
    enc2 = keyStr.indexOf(input.charAt(i++));
    enc3 = keyStr.indexOf(input.charAt(i++));
    enc4 = keyStr.indexOf(input.charAt(i++));

    chr1 = (enc1 << 2) | (enc2 >> 4);
    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    chr3 = ((enc3 & 3) << 6) | enc4;

    output = output + String.fromCharCode(chr1);

    if (enc3 !== 64) {
      output = output + String.fromCharCode(chr2);
    }
    if (enc4 !== 64) {
      output = output + String.fromCharCode(chr3);
    }
  } while (i < input.length);
  return output;
};

// Converts a string of base64 into a byte array.
// Throws error on invalid input.
function intArrayFromBase64(s) {
  if (typeof ENVIRONMENT_IS_NODE === 'boolean' && ENVIRONMENT_IS_NODE) {
    var buf;
    try {
      buf = Buffer.from(s, 'base64');
    } catch (_) {
      buf = new Buffer(s, 'base64');
    }
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  try {
    var decoded = decodeBase64(s);
    var bytes = new Uint8Array(decoded.length);
    for (var i = 0 ; i < decoded.length ; ++i) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return bytes;
  } catch (_) {
    throw new Error('Converting base64 string to bytes failed.');
  }
}

// If filename is a base64 data URI, parses and returns data (Buffer on node,
// Uint8Array otherwise). If filename is not a base64 data URI, returns undefined.
function tryParseAsDataURI(filename) {
  var dataURIPrefix = 'data:application/octet-stream;base64,';

  if (!(
    String.prototype.startsWith ?
      filename.startsWith(dataURIPrefix) :
      filename.indexOf(dataURIPrefix) === 0
  )) {
    return;
  }

  return intArrayFromBase64(filename.slice(dataURIPrefix.length));
}





function nullFunc_ddi(x) { Module["printErr"]("Invalid function pointer called with signature 'ddi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_i(x) { Module["printErr"]("Invalid function pointer called with signature 'i'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iid(x) { Module["printErr"]("Invalid function pointer called with signature 'iid'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iii(x) { Module["printErr"]("Invalid function pointer called with signature 'iii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viii(x) { Module["printErr"]("Invalid function pointer called with signature 'viii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_ddi(index,a1,a2) {
  try {
    return Module["dynCall_ddi"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_i(index) {
  try {
    return Module["dynCall_i"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iid(index,a1,a2) {
  try {
    return Module["dynCall_iid"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iii(index,a1,a2) {
  try {
    return Module["dynCall_iii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiiii(index,a1,a2,a3,a4) {
  try {
    return Module["dynCall_iiiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vii(index,a1,a2) {
  try {
    Module["dynCall_vii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viii(index,a1,a2,a3) {
  try {
    Module["dynCall_viii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiii(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiii(index,a1,a2,a3,a4,a5) {
  try {
    Module["dynCall_viiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    Module["dynCall_viiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_ddi": nullFunc_ddi, "nullFunc_i": nullFunc_i, "nullFunc_ii": nullFunc_ii, "nullFunc_iid": nullFunc_iid, "nullFunc_iii": nullFunc_iii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_iiiii": nullFunc_iiiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_viii": nullFunc_viii, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_ddi": invoke_ddi, "invoke_i": invoke_i, "invoke_ii": invoke_ii, "invoke_iid": invoke_iid, "invoke_iii": invoke_iii, "invoke_iiii": invoke_iiii, "invoke_iiiii": invoke_iiiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viii": invoke_viii, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "ClassHandle": ClassHandle, "ClassHandle_clone": ClassHandle_clone, "ClassHandle_delete": ClassHandle_delete, "ClassHandle_deleteLater": ClassHandle_deleteLater, "ClassHandle_isAliasOf": ClassHandle_isAliasOf, "ClassHandle_isDeleted": ClassHandle_isDeleted, "RegisteredClass": RegisteredClass, "RegisteredPointer": RegisteredPointer, "RegisteredPointer_deleteObject": RegisteredPointer_deleteObject, "RegisteredPointer_destructor": RegisteredPointer_destructor, "RegisteredPointer_fromWireType": RegisteredPointer_fromWireType, "RegisteredPointer_getPointee": RegisteredPointer_getPointee, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___assert_fail": ___assert_fail, "___cxa_allocate_exception": ___cxa_allocate_exception, "___cxa_begin_catch": ___cxa_begin_catch, "___cxa_end_catch": ___cxa_end_catch, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___cxa_find_matching_catch_2": ___cxa_find_matching_catch_2, "___cxa_find_matching_catch_3": ___cxa_find_matching_catch_3, "___cxa_free_exception": ___cxa_free_exception, "___cxa_throw": ___cxa_throw, "___gxx_personality_v0": ___gxx_personality_v0, "___lock": ___lock, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "__embind_register_bool": __embind_register_bool, "__embind_register_class": __embind_register_class, "__embind_register_class_constructor": __embind_register_class_constructor, "__embind_register_class_function": __embind_register_class_function, "__embind_register_emval": __embind_register_emval, "__embind_register_float": __embind_register_float, "__embind_register_integer": __embind_register_integer, "__embind_register_memory_view": __embind_register_memory_view, "__embind_register_std_string": __embind_register_std_string, "__embind_register_std_wstring": __embind_register_std_wstring, "__embind_register_void": __embind_register_void, "__emval_decref": __emval_decref, "__emval_register": __emval_register, "_abort": _abort, "_embind_repr": _embind_repr, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_pthread_getspecific": _pthread_getspecific, "_pthread_key_create": _pthread_key_create, "_pthread_once": _pthread_once, "_pthread_setspecific": _pthread_setspecific, "constNoSmartPtrRawPointerToWireType": constNoSmartPtrRawPointerToWireType, "count_emval_handles": count_emval_handles, "craftInvokerFunction": craftInvokerFunction, "createNamedFunction": createNamedFunction, "downcastPointer": downcastPointer, "embind_init_charCodes": embind_init_charCodes, "ensureOverloadTable": ensureOverloadTable, "exposePublicSymbol": exposePublicSymbol, "extendError": extendError, "floatReadValueFromPointer": floatReadValueFromPointer, "flushPendingDeletes": flushPendingDeletes, "genericPointerToWireType": genericPointerToWireType, "getBasestPointer": getBasestPointer, "getInheritedInstance": getInheritedInstance, "getInheritedInstanceCount": getInheritedInstanceCount, "getLiveInheritedInstances": getLiveInheritedInstances, "getShiftFromSize": getShiftFromSize, "getTypeName": getTypeName, "get_first_emval": get_first_emval, "heap32VectorToArray": heap32VectorToArray, "init_ClassHandle": init_ClassHandle, "init_RegisteredPointer": init_RegisteredPointer, "init_embind": init_embind, "init_emval": init_emval, "integerReadValueFromPointer": integerReadValueFromPointer, "makeClassHandle": makeClassHandle, "makeLegalFunctionName": makeLegalFunctionName, "new_": new_, "nonConstNoSmartPtrRawPointerToWireType": nonConstNoSmartPtrRawPointerToWireType, "readLatin1String": readLatin1String, "registerType": registerType, "replacePublicSymbol": replacePublicSymbol, "requireFunction": requireFunction, "runDestructor": runDestructor, "runDestructors": runDestructors, "setDelayFunction": setDelayFunction, "shallowCopyInternalPointer": shallowCopyInternalPointer, "simpleReadValueFromPointer": simpleReadValueFromPointer, "throwBindingError": throwBindingError, "throwInstanceAlreadyDeleted": throwInstanceAlreadyDeleted, "throwInternalError": throwInternalError, "throwUnboundTypeError": throwUnboundTypeError, "upcastPointer": upcastPointer, "whenDependentTypesAreResolved": whenDependentTypesAreResolved, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8 };
// EMSCRIPTEN_START_ASM
var asm = (/** @suppress {uselessCode} */ function(global, env, buffer) {
'almost asm';


  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);

  var DYNAMICTOP_PTR=env.DYNAMICTOP_PTR|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var cttz_i8=env.cttz_i8|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntS = 0, tempValue = 0, tempDouble = 0.0;
  var tempRet0 = 0;

  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_max=global.Math.max;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var enlargeMemory=env.enlargeMemory;
  var getTotalMemory=env.getTotalMemory;
  var abortOnCannotGrowMemory=env.abortOnCannotGrowMemory;
  var abortStackOverflow=env.abortStackOverflow;
  var nullFunc_ddi=env.nullFunc_ddi;
  var nullFunc_i=env.nullFunc_i;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_iid=env.nullFunc_iid;
  var nullFunc_iii=env.nullFunc_iii;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_iiiii=env.nullFunc_iiiii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_vii=env.nullFunc_vii;
  var nullFunc_viii=env.nullFunc_viii;
  var nullFunc_viiii=env.nullFunc_viiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var invoke_ddi=env.invoke_ddi;
  var invoke_i=env.invoke_i;
  var invoke_ii=env.invoke_ii;
  var invoke_iid=env.invoke_iid;
  var invoke_iii=env.invoke_iii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_iiiii=env.invoke_iiiii;
  var invoke_v=env.invoke_v;
  var invoke_vi=env.invoke_vi;
  var invoke_vii=env.invoke_vii;
  var invoke_viii=env.invoke_viii;
  var invoke_viiii=env.invoke_viiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
  var ClassHandle=env.ClassHandle;
  var ClassHandle_clone=env.ClassHandle_clone;
  var ClassHandle_delete=env.ClassHandle_delete;
  var ClassHandle_deleteLater=env.ClassHandle_deleteLater;
  var ClassHandle_isAliasOf=env.ClassHandle_isAliasOf;
  var ClassHandle_isDeleted=env.ClassHandle_isDeleted;
  var RegisteredClass=env.RegisteredClass;
  var RegisteredPointer=env.RegisteredPointer;
  var RegisteredPointer_deleteObject=env.RegisteredPointer_deleteObject;
  var RegisteredPointer_destructor=env.RegisteredPointer_destructor;
  var RegisteredPointer_fromWireType=env.RegisteredPointer_fromWireType;
  var RegisteredPointer_getPointee=env.RegisteredPointer_getPointee;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var ___assert_fail=env.___assert_fail;
  var ___cxa_allocate_exception=env.___cxa_allocate_exception;
  var ___cxa_begin_catch=env.___cxa_begin_catch;
  var ___cxa_end_catch=env.___cxa_end_catch;
  var ___cxa_find_matching_catch=env.___cxa_find_matching_catch;
  var ___cxa_find_matching_catch_2=env.___cxa_find_matching_catch_2;
  var ___cxa_find_matching_catch_3=env.___cxa_find_matching_catch_3;
  var ___cxa_free_exception=env.___cxa_free_exception;
  var ___cxa_throw=env.___cxa_throw;
  var ___gxx_personality_v0=env.___gxx_personality_v0;
  var ___lock=env.___lock;
  var ___resumeException=env.___resumeException;
  var ___setErrNo=env.___setErrNo;
  var ___syscall140=env.___syscall140;
  var ___syscall146=env.___syscall146;
  var ___syscall54=env.___syscall54;
  var ___syscall6=env.___syscall6;
  var ___unlock=env.___unlock;
  var __embind_register_bool=env.__embind_register_bool;
  var __embind_register_class=env.__embind_register_class;
  var __embind_register_class_constructor=env.__embind_register_class_constructor;
  var __embind_register_class_function=env.__embind_register_class_function;
  var __embind_register_emval=env.__embind_register_emval;
  var __embind_register_float=env.__embind_register_float;
  var __embind_register_integer=env.__embind_register_integer;
  var __embind_register_memory_view=env.__embind_register_memory_view;
  var __embind_register_std_string=env.__embind_register_std_string;
  var __embind_register_std_wstring=env.__embind_register_std_wstring;
  var __embind_register_void=env.__embind_register_void;
  var __emval_decref=env.__emval_decref;
  var __emval_register=env.__emval_register;
  var _abort=env._abort;
  var _embind_repr=env._embind_repr;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _pthread_getspecific=env._pthread_getspecific;
  var _pthread_key_create=env._pthread_key_create;
  var _pthread_once=env._pthread_once;
  var _pthread_setspecific=env._pthread_setspecific;
  var constNoSmartPtrRawPointerToWireType=env.constNoSmartPtrRawPointerToWireType;
  var count_emval_handles=env.count_emval_handles;
  var craftInvokerFunction=env.craftInvokerFunction;
  var createNamedFunction=env.createNamedFunction;
  var downcastPointer=env.downcastPointer;
  var embind_init_charCodes=env.embind_init_charCodes;
  var ensureOverloadTable=env.ensureOverloadTable;
  var exposePublicSymbol=env.exposePublicSymbol;
  var extendError=env.extendError;
  var floatReadValueFromPointer=env.floatReadValueFromPointer;
  var flushPendingDeletes=env.flushPendingDeletes;
  var genericPointerToWireType=env.genericPointerToWireType;
  var getBasestPointer=env.getBasestPointer;
  var getInheritedInstance=env.getInheritedInstance;
  var getInheritedInstanceCount=env.getInheritedInstanceCount;
  var getLiveInheritedInstances=env.getLiveInheritedInstances;
  var getShiftFromSize=env.getShiftFromSize;
  var getTypeName=env.getTypeName;
  var get_first_emval=env.get_first_emval;
  var heap32VectorToArray=env.heap32VectorToArray;
  var init_ClassHandle=env.init_ClassHandle;
  var init_RegisteredPointer=env.init_RegisteredPointer;
  var init_embind=env.init_embind;
  var init_emval=env.init_emval;
  var integerReadValueFromPointer=env.integerReadValueFromPointer;
  var makeClassHandle=env.makeClassHandle;
  var makeLegalFunctionName=env.makeLegalFunctionName;
  var new_=env.new_;
  var nonConstNoSmartPtrRawPointerToWireType=env.nonConstNoSmartPtrRawPointerToWireType;
  var readLatin1String=env.readLatin1String;
  var registerType=env.registerType;
  var replacePublicSymbol=env.replacePublicSymbol;
  var requireFunction=env.requireFunction;
  var runDestructor=env.runDestructor;
  var runDestructors=env.runDestructors;
  var setDelayFunction=env.setDelayFunction;
  var shallowCopyInternalPointer=env.shallowCopyInternalPointer;
  var simpleReadValueFromPointer=env.simpleReadValueFromPointer;
  var throwBindingError=env.throwBindingError;
  var throwInstanceAlreadyDeleted=env.throwInstanceAlreadyDeleted;
  var throwInternalError=env.throwInternalError;
  var throwUnboundTypeError=env.throwUnboundTypeError;
  var upcastPointer=env.upcastPointer;
  var whenDependentTypesAreResolved=env.whenDependentTypesAreResolved;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
  if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(size|0);

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function __ZN6MyJsonC2ERKNSt3__212basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$sink = 0, $$sink2 = 0, $$sink4 = 0, $$sink6 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0;
 var $8 = 0, $80 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $17 = $0;
 $18 = $1;
 $22 = $17;
 __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_EC2EPS5_jPS4_($22,0,1024,0);
 $23 = $18;
 $16 = $23;
 $24 = $16;
 $15 = $24;
 $25 = $15;
 $14 = $25;
 $26 = $14;
 $13 = $26;
 $27 = $13;
 $12 = $27;
 $28 = $12;
 $11 = $28;
 $29 = $11;
 $30 = ((($29)) + 11|0);
 $31 = HEAP8[$30>>0]|0;
 $32 = $31&255;
 $33 = $32 & 128;
 $34 = ($33|0)!=(0);
 if ($34) {
  $5 = $26;
  $35 = $5;
  $4 = $35;
  $36 = $4;
  $3 = $36;
  $37 = $3;
  $38 = HEAP32[$37>>2]|0;
  $44 = $38;
 } else {
  $10 = $26;
  $39 = $10;
  $9 = $39;
  $40 = $9;
  $8 = $40;
  $41 = $8;
  $7 = $41;
  $42 = $7;
  $6 = $42;
  $43 = $6;
  $44 = $43;
 }
 $2 = $44;
 $45 = $2;
 $19 = $45;
 $46 = $19;
 __THREW__ = 0;
 (invoke_iii(33,($22|0),($46|0))|0);
 $47 = __THREW__; __THREW__ = 0;
 $48 = $47&1;
 do {
  if (!($48)) {
   __THREW__ = 0;
   $49 = (invoke_iii(34,($22|0),(4752|0))|0);
   $50 = __THREW__; __THREW__ = 0;
   $51 = $50&1;
   if (!($51)) {
    if ($49) {
     __THREW__ = 0;
     $52 = (invoke_iii(35,($22|0),(4752|0))|0);
     $53 = __THREW__; __THREW__ = 0;
     $54 = $53&1;
     if ($54) {
      break;
     } else {
      $$sink = $52;
     }
    } else {
     $$sink = 0;
    }
    $59 = ((($22)) + 64|0);
    HEAP32[$59>>2] = $$sink;
    __THREW__ = 0;
    $60 = (invoke_iii(34,($22|0),(4757|0))|0);
    $61 = __THREW__; __THREW__ = 0;
    $62 = $61&1;
    if (!($62)) {
     if ($60) {
      __THREW__ = 0;
      $63 = (invoke_iii(35,($22|0),(4757|0))|0);
      $64 = __THREW__; __THREW__ = 0;
      $65 = $64&1;
      if ($65) {
       break;
      } else {
       $$sink2 = $63;
      }
     } else {
      $$sink2 = 0;
     }
     $66 = ((($22)) + 68|0);
     HEAP32[$66>>2] = $$sink2;
     __THREW__ = 0;
     $67 = (invoke_iii(34,($22|0),(4770|0))|0);
     $68 = __THREW__; __THREW__ = 0;
     $69 = $68&1;
     if (!($69)) {
      if ($67) {
       __THREW__ = 0;
       $70 = (invoke_iii(35,($22|0),(4770|0))|0);
       $71 = __THREW__; __THREW__ = 0;
       $72 = $71&1;
       if ($72) {
        break;
       } else {
        $$sink4 = $70;
       }
      } else {
       $$sink4 = 0;
      }
      $73 = ((($22)) + 72|0);
      HEAP32[$73>>2] = $$sink4;
      __THREW__ = 0;
      $74 = (invoke_iii(34,($22|0),(4774|0))|0);
      $75 = __THREW__; __THREW__ = 0;
      $76 = $75&1;
      if (!($76)) {
       if (!($74)) {
        $$sink6 = 0;
        $80 = ((($22)) + 76|0);
        HEAP32[$80>>2] = $$sink6;
        STACKTOP = sp;return;
       }
       __THREW__ = 0;
       $77 = (invoke_iii(35,($22|0),(4774|0))|0);
       $78 = __THREW__; __THREW__ = 0;
       $79 = $78&1;
       if (!($79)) {
        $$sink6 = $77;
        $80 = ((($22)) + 76|0);
        HEAP32[$80>>2] = $$sink6;
        STACKTOP = sp;return;
       }
      }
     }
    }
   }
  }
 } while(0);
 $55 = ___cxa_find_matching_catch_2()|0;
 $56 = tempRet0;
 $20 = $55;
 $21 = $56;
 __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_ED2Ev($22);
 $57 = $20;
 $58 = $21;
 ___resumeException($57|0);
 // unreachable;
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_EC2EPS5_jPS4_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $10 = $4;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2Ev($10);
 $11 = ((($10)) + 24|0);
 $12 = $5;
 HEAP32[$11>>2] = $12;
 $13 = ((($10)) + 28|0);
 HEAP32[$13>>2] = 0;
 $14 = ((($10)) + 32|0);
 $15 = $7;
 $16 = $6;
 __THREW__ = 0;
 invoke_viii(36,($14|0),($15|0),($16|0));
 $17 = __THREW__; __THREW__ = 0;
 $18 = $17&1;
 if ($18) {
  $32 = ___cxa_find_matching_catch_2()|0;
  $33 = tempRet0;
  $8 = $32;
  $9 = $33;
  __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($10);
  $38 = $8;
  $39 = $9;
  ___resumeException($38|0);
  // unreachable;
 }
 $19 = ((($10)) + 56|0);
 __THREW__ = 0;
 invoke_vi(37,($19|0));
 $20 = __THREW__; __THREW__ = 0;
 $21 = $20&1;
 do {
  if ($21) {
   label = 8;
  } else {
   $22 = ((($10)) + 24|0);
   $23 = HEAP32[$22>>2]|0;
   $24 = ($23|0)!=(0|0);
   if ($24) {
    STACKTOP = sp;return;
   }
   __THREW__ = 0;
   $25 = (invoke_ii(38,20)|0);
   $26 = __THREW__; __THREW__ = 0;
   $27 = $26&1;
   if ($27) {
    label = 8;
   } else {
    __THREW__ = 0;
    invoke_viii(39,($25|0),65536,(0|0));
    $28 = __THREW__; __THREW__ = 0;
    $29 = $28&1;
    if ($29) {
     $36 = ___cxa_find_matching_catch_2()|0;
     $37 = tempRet0;
     $8 = $36;
     $9 = $37;
     __ZdlPv($25);
     break;
    }
    $30 = ((($10)) + 24|0);
    HEAP32[$30>>2] = $25;
    $31 = ((($10)) + 28|0);
    HEAP32[$31>>2] = $25;
    STACKTOP = sp;return;
   }
  }
 } while(0);
 if ((label|0) == 8) {
  $34 = ___cxa_find_matching_catch_2()|0;
  $35 = tempRet0;
  $8 = $34;
  $9 = $35;
 }
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEED2Ev($14);
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($10);
 $38 = $8;
 $39 = $9;
 ___resumeException($38|0);
 // unreachable;
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E5ParseEPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E5ParseILj0EEERS6_PKc($4,$5)|0);
 STACKTOP = sp;return ($6|0);
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9HasMemberEPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$byval_copy = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $$byval_copy = sp + 16|0;
 $4 = sp + 4|0;
 $5 = sp;
 $2 = $0;
 $3 = $1;
 $6 = $2;
 $7 = $3;
 $8 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE10FindMemberEPKc($6,$7)|0);
 HEAP32[$4>>2] = $8;
 $9 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9MemberEndEv($6)|0);
 HEAP32[$5>>2] = $9;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$5>>2]|0;
 $10 = (__ZNK9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEneES6_($4,$$byval_copy)|0);
 STACKTOP = sp;return ($10|0);
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEixIKcEENS_8internal9DisableIfINS9_15RemoveSfinaeTagIPFRNS9_9SfinaeTagENS9_7NotExprINS9_6IsSameINS9_11RemoveConstIT_E4TypeEcEEEEEE4TypeERS6_E4TypeEPSH_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $4 = sp;
 $5 = sp + 32|0;
 $2 = $0;
 $3 = $1;
 $8 = $2;
 $9 = $3;
 __ZN9rapidjson9StringRefIcEENS_16GenericStringRefIT_EEPKS2_($5,$9);
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2ENS_16GenericStringRefIcEE($4,$5);
 __THREW__ = 0;
 $10 = (invoke_iii(40,($8|0),($4|0))|0);
 $11 = __THREW__; __THREW__ = 0;
 $12 = $11&1;
 if ($12) {
  $13 = ___cxa_find_matching_catch_2()|0;
  $14 = tempRet0;
  $6 = $13;
  $7 = $14;
  __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($4);
  $15 = $6;
  $16 = $7;
  ___resumeException($15|0);
  // unreachable;
 } else {
  __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($4);
  STACKTOP = sp;return ($10|0);
 }
 return (0)|0;
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_ED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $4 = $1;
 __THREW__ = 0;
 invoke_vi(41,($4|0));
 $5 = __THREW__; __THREW__ = 0;
 $6 = $5&1;
 if ($6) {
  $8 = ___cxa_find_matching_catch_3(0|0)|0;
  $9 = tempRet0;
  $2 = $8;
  $3 = $9;
  $10 = ((($4)) + 32|0);
  __ZN9rapidjson8internal5StackINS_12CrtAllocatorEED2Ev($10);
  __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($4);
  $11 = $2;
  ___clang_call_terminate($11);
  // unreachable;
 } else {
  $7 = ((($4)) + 32|0);
  __ZN9rapidjson8internal5StackINS_12CrtAllocatorEED2Ev($7);
  __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($4);
  STACKTOP = sp;return;
 }
}
function __ZN6MyJson7GetNameEv($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$expand_i1_val = 0, $$expand_i1_val2 = 0, $$pre_trunc = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0;
 var $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0;
 var $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0;
 var $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(224|0);
 $38 = sp;
 $40 = sp + 218|0;
 $51 = sp + 217|0;
 $58 = sp + 216|0;
 $57 = $1;
 $59 = $57;
 $$expand_i1_val = 0;
 HEAP8[$58>>0] = $$expand_i1_val;
 $60 = ((($59)) + 64|0);
 $61 = HEAP32[$60>>2]|0;
 $62 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9GetStringEv($61)|0);
 $55 = $0;
 $56 = $62;
 $63 = $55;
 $54 = $63;
 $64 = $54;
 $53 = $64;
 $65 = $53;
 $52 = $65;
 ;HEAP32[$65>>2]=0|0;HEAP32[$65+4>>2]=0|0;HEAP32[$65+8>>2]=0|0;
 $66 = $56;
 $67 = $56;
 $68 = (__ZNSt3__211char_traitsIcE6lengthEPKc($67)|0);
 $46 = $63;
 $47 = $66;
 $48 = $68;
 $69 = $46;
 $70 = $48;
 $44 = $69;
 $71 = $44;
 $43 = $71;
 $72 = $43;
 $42 = $72;
 $73 = $42;
 $41 = $73;
 $74 = $41;
 $39 = $74;
 $75 = $39;
 ;HEAP8[$38>>0]=HEAP8[$40>>0]|0;
 $37 = $75;
 $76 = $37;
 $36 = $76;
 $45 = -1;
 $77 = $45;
 $78 = (($77) - 16)|0;
 $79 = ($70>>>0)>($78>>>0);
 if ($79) {
  __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($69);
  // unreachable;
 }
 $80 = $48;
 $81 = ($80>>>0)<(11);
 $82 = $48;
 if ($81) {
  $34 = $69;
  $35 = $82;
  $83 = $34;
  $84 = $35;
  $85 = $84&255;
  $33 = $83;
  $86 = $33;
  $32 = $86;
  $87 = $32;
  $88 = ((($87)) + 11|0);
  HEAP8[$88>>0] = $85;
  $31 = $69;
  $89 = $31;
  $30 = $89;
  $90 = $30;
  $29 = $90;
  $91 = $29;
  $28 = $91;
  $92 = $28;
  $27 = $92;
  $93 = $27;
  $49 = $93;
 } else {
  $6 = $82;
  $94 = $6;
  $95 = ($94>>>0)<(11);
  if ($95) {
   $102 = 11;
  } else {
   $96 = $6;
   $97 = (($96) + 1)|0;
   $5 = $97;
   $98 = $5;
   $99 = (($98) + 15)|0;
   $100 = $99 & -16;
   $102 = $100;
  }
  $101 = (($102) - 1)|0;
  $50 = $101;
  $4 = $69;
  $103 = $4;
  $3 = $103;
  $104 = $3;
  $2 = $104;
  $105 = $2;
  $106 = $50;
  $107 = (($106) + 1)|0;
  $12 = $105;
  $13 = $107;
  $108 = $12;
  $109 = $13;
  $9 = $108;
  $10 = $109;
  $11 = 0;
  $110 = $9;
  $8 = $110;
  $111 = $10;
  $7 = $111;
  $112 = $7;
  $113 = (__Znwj($112)|0);
  $49 = $113;
  $114 = $49;
  $16 = $69;
  $17 = $114;
  $115 = $16;
  $116 = $17;
  $15 = $115;
  $117 = $15;
  $14 = $117;
  $118 = $14;
  HEAP32[$118>>2] = $116;
  $119 = $50;
  $120 = (($119) + 1)|0;
  $20 = $69;
  $21 = $120;
  $121 = $20;
  $122 = $21;
  $123 = -2147483648 | $122;
  $19 = $121;
  $124 = $19;
  $18 = $124;
  $125 = $18;
  $126 = ((($125)) + 8|0);
  HEAP32[$126>>2] = $123;
  $127 = $48;
  $24 = $69;
  $25 = $127;
  $128 = $24;
  $129 = $25;
  $23 = $128;
  $130 = $23;
  $22 = $130;
  $131 = $22;
  $132 = ((($131)) + 4|0);
  HEAP32[$132>>2] = $129;
 }
 $133 = $49;
 $26 = $133;
 $134 = $26;
 $135 = $47;
 $136 = $48;
 (__ZNSt3__211char_traitsIcE4copyEPcPKcj($134,$135,$136)|0);
 $137 = $49;
 $138 = $48;
 $139 = (($137) + ($138)|0);
 HEAP8[$51>>0] = 0;
 __ZNSt3__211char_traitsIcE6assignERcRKc($139,$51);
 $$expand_i1_val2 = 1;
 HEAP8[$58>>0] = $$expand_i1_val2;
 $$pre_trunc = HEAP8[$58>>0]|0;
 $140 = $$pre_trunc&1;
 if ($140) {
  STACKTOP = sp;return;
 }
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($0);
 STACKTOP = sp;return;
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9GetStringEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsStringEv($2)|0);
 if (!($3)) {
  ___assert_fail((5976|0),(4920|0),1745,(6047|0));
  // unreachable;
 }
 $4 = ((($2)) + 18|0);
 $5 = HEAP16[$4>>1]|0;
 $6 = $5&65535;
 $7 = $6 & 4096;
 $8 = ($7|0)!=(0);
 if ($8) {
  $10 = $2;
  STACKTOP = sp;return ($10|0);
 } else {
  $9 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE16GetStringPointerEv($2)|0);
  $10 = $9;
  STACKTOP = sp;return ($10|0);
 }
 return (0)|0;
}
function __ZN6MyJson9GetSupplyEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $3 = $1;
 $4 = ((($3)) + 68|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE6GetIntEv($5)|0);
 $2 = $6;
 $7 = $2;
 STACKTOP = sp;return ($7|0);
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE6GetIntEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 18|0);
 $4 = HEAP16[$3>>1]|0;
 $5 = $4&65535;
 $6 = $5 & 32;
 $7 = ($6|0)!=(0);
 if ($7) {
  $8 = HEAP32[$2>>2]|0;
  STACKTOP = sp;return ($8|0);
 } else {
  ___assert_fail((6057|0),(4920|0),1709,(6082|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN6MyJson6GetMapERKNSt3__212basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0;
 var $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 144|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(144|0);
 $33 = $0;
 $34 = $1;
 $36 = $33;
 $37 = ((($36)) + 72|0);
 $38 = HEAP32[$37>>2]|0;
 $39 = $34;
 $31 = $39;
 $40 = $31;
 $30 = $40;
 $41 = $30;
 $29 = $41;
 $42 = $29;
 $28 = $42;
 $43 = $28;
 $27 = $43;
 $44 = $27;
 $26 = $44;
 $45 = $26;
 $46 = ((($45)) + 11|0);
 $47 = HEAP8[$46>>0]|0;
 $48 = $47&255;
 $49 = $48 & 128;
 $50 = ($49|0)!=(0);
 if ($50) {
  $20 = $42;
  $51 = $20;
  $19 = $51;
  $52 = $19;
  $18 = $52;
  $53 = $18;
  $54 = HEAP32[$53>>2]|0;
  $60 = $54;
 } else {
  $25 = $42;
  $55 = $25;
  $24 = $55;
  $56 = $24;
  $23 = $56;
  $57 = $23;
  $22 = $57;
  $58 = $22;
  $21 = $58;
  $59 = $21;
  $60 = $59;
 }
 $17 = $60;
 $61 = $17;
 $62 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9HasMemberEPKc($38,$61)|0);
 if (!($62)) {
  $32 = -1;
  $91 = $32;
  STACKTOP = sp;return ($91|0);
 }
 $63 = ((($36)) + 72|0);
 $64 = HEAP32[$63>>2]|0;
 $65 = $34;
 $16 = $65;
 $66 = $16;
 $15 = $66;
 $67 = $15;
 $14 = $67;
 $68 = $14;
 $13 = $68;
 $69 = $13;
 $12 = $69;
 $70 = $12;
 $11 = $70;
 $71 = $11;
 $72 = ((($71)) + 11|0);
 $73 = HEAP8[$72>>0]|0;
 $74 = $73&255;
 $75 = $74 & 128;
 $76 = ($75|0)!=(0);
 if ($76) {
  $5 = $68;
  $77 = $5;
  $4 = $77;
  $78 = $4;
  $3 = $78;
  $79 = $3;
  $80 = HEAP32[$79>>2]|0;
  $86 = $80;
 } else {
  $10 = $68;
  $81 = $10;
  $9 = $81;
  $82 = $9;
  $8 = $82;
  $83 = $8;
  $7 = $83;
  $84 = $7;
  $6 = $84;
  $85 = $6;
  $86 = $85;
 }
 $2 = $86;
 $87 = $2;
 $88 = (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEixIKcEENS_8internal9DisableIfINS9_15RemoveSfinaeTagIPFRNS9_9SfinaeTagENS9_7NotExprINS9_6IsSameINS9_11RemoveConstIT_E4TypeEcEEEEEE4TypeERS6_E4TypeEPSH_($64,$87)|0);
 $89 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE6GetIntEv($88)|0);
 $35 = $89;
 $90 = $35;
 $32 = $90;
 $91 = $32;
 STACKTOP = sp;return ($91|0);
}
function __ZN6MyJson7GetMap2ERKNSt3__212basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0;
 var $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 144|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(144|0);
 $33 = $0;
 $34 = $1;
 $36 = $33;
 $37 = ((($36)) + 76|0);
 $38 = HEAP32[$37>>2]|0;
 $39 = (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE5BeginEv($38)|0);
 $35 = $39;
 while(1) {
  $40 = $35;
  $41 = ((($36)) + 76|0);
  $42 = HEAP32[$41>>2]|0;
  $43 = (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE3EndEv($42)|0);
  $44 = ($40|0)!=($43|0);
  if (!($44)) {
   label = 12;
   break;
  }
  $45 = $35;
  $46 = $34;
  $31 = $46;
  $47 = $31;
  $30 = $47;
  $48 = $30;
  $29 = $48;
  $49 = $29;
  $28 = $49;
  $50 = $28;
  $27 = $50;
  $51 = $27;
  $26 = $51;
  $52 = $26;
  $53 = ((($52)) + 11|0);
  $54 = HEAP8[$53>>0]|0;
  $55 = $54&255;
  $56 = $55 & 128;
  $57 = ($56|0)!=(0);
  if ($57) {
   $20 = $49;
   $58 = $20;
   $19 = $58;
   $59 = $19;
   $18 = $59;
   $60 = $18;
   $61 = HEAP32[$60>>2]|0;
   $67 = $61;
  } else {
   $25 = $49;
   $62 = $25;
   $24 = $62;
   $63 = $24;
   $23 = $63;
   $64 = $23;
   $22 = $64;
   $65 = $22;
   $21 = $65;
   $66 = $21;
   $67 = $66;
  }
  $17 = $67;
  $68 = $17;
  $69 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9HasMemberEPKc($45,$68)|0);
  $70 = $35;
  if ($69) {
   break;
  }
  $96 = ((($70)) + 24|0);
  $35 = $96;
 }
 if ((label|0) == 12) {
  $32 = -1;
  $97 = $32;
  STACKTOP = sp;return ($97|0);
 }
 $71 = $34;
 $16 = $71;
 $72 = $16;
 $15 = $72;
 $73 = $15;
 $14 = $73;
 $74 = $14;
 $13 = $74;
 $75 = $13;
 $12 = $75;
 $76 = $12;
 $11 = $76;
 $77 = $11;
 $78 = ((($77)) + 11|0);
 $79 = HEAP8[$78>>0]|0;
 $80 = $79&255;
 $81 = $80 & 128;
 $82 = ($81|0)!=(0);
 if ($82) {
  $5 = $74;
  $83 = $5;
  $4 = $83;
  $84 = $4;
  $3 = $84;
  $85 = $3;
  $86 = HEAP32[$85>>2]|0;
  $92 = $86;
 } else {
  $10 = $74;
  $87 = $10;
  $9 = $87;
  $88 = $9;
  $8 = $88;
  $89 = $8;
  $7 = $89;
  $90 = $7;
  $6 = $90;
  $91 = $6;
  $92 = $91;
 }
 $2 = $92;
 $93 = $2;
 $94 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEixIKcEENS_8internal9DisableIfINS9_15RemoveSfinaeTagIPFRNS9_9SfinaeTagENS9_7NotExprINS9_6IsSameINS9_11RemoveConstIT_E4TypeEcEEEEEE4TypeERKS6_E4TypeEPSH_($70,$93)|0);
 $95 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE6GetIntEv($94)|0);
 $32 = $95;
 $97 = $32;
 STACKTOP = sp;return ($97|0);
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE5BeginEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE7IsArrayEv($2)|0);
 if ($3) {
  $4 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE18GetElementsPointerEv($2)|0);
  STACKTOP = sp;return ($4|0);
 } else {
  ___assert_fail((6089|0),(4920|0),1569,(6099|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE3EndEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE7IsArrayEv($2)|0);
 if ($3) {
  $4 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE18GetElementsPointerEv($2)|0);
  $5 = HEAP32[$2>>2]|0;
  $6 = (($4) + (($5*24)|0)|0);
  STACKTOP = sp;return ($6|0);
 } else {
  ___assert_fail((6089|0),(4920|0),1572,(6105|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEixIKcEENS_8internal9DisableIfINS9_15RemoveSfinaeTagIPFRNS9_9SfinaeTagENS9_7NotExprINS9_6IsSameINS9_11RemoveConstIT_E4TypeEcEEEEEE4TypeERKS6_E4TypeEPSH_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEixIKcEENS_8internal9DisableIfINS9_15RemoveSfinaeTagIPFRNS9_9SfinaeTagENS9_7NotExprINS9_6IsSameINS9_11RemoveConstIT_E4TypeEcEEEEEE4TypeERS6_E4TypeEPSH_($4,$5)|0);
 STACKTOP = sp;return ($6|0);
}
function __ZN6MyJson9GetMyJsonEv($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$expand_i1_val = 0, $$expand_i1_val2 = 0, $$pre_trunc = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0;
 var $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0;
 var $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0;
 var $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0;
 var $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0;
 var $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0;
 var $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 304|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(304|0);
 $38 = sp;
 $40 = sp + 294|0;
 $51 = sp + 293|0;
 $58 = sp + 56|0;
 $59 = sp + 16|0;
 $63 = sp + 292|0;
 $57 = $1;
 $64 = $57;
 __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEC2EPS3_j($58,0,256);
 __THREW__ = 0;
 invoke_viiii(42,($59|0),($58|0),(0|0),32);
 $65 = __THREW__; __THREW__ = 0;
 $66 = $65&1;
 if ($66) {
  $154 = ___cxa_find_matching_catch_2()|0;
  $155 = tempRet0;
  $60 = $154;
  $61 = $155;
  __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEED2Ev($58);
  $158 = $60;
  $159 = $61;
  ___resumeException($158|0);
  // unreachable;
 }
 __THREW__ = 0;
 (invoke_iii(43,($64|0),($59|0))|0);
 $67 = __THREW__; __THREW__ = 0;
 $68 = $67&1;
 do {
  if (!($68)) {
   __THREW__ = 0;
   $69 = (invoke_ii(44,($58|0))|0);
   $70 = __THREW__; __THREW__ = 0;
   $71 = $70&1;
   if (!($71)) {
    $62 = $69;
    $$expand_i1_val = 0;
    HEAP8[$63>>0] = $$expand_i1_val;
    $72 = $62;
    $55 = $0;
    $56 = $72;
    $73 = $55;
    $54 = $73;
    $74 = $54;
    $53 = $74;
    $75 = $53;
    $52 = $75;
    ;HEAP32[$75>>2]=0|0;HEAP32[$75+4>>2]=0|0;HEAP32[$75+8>>2]=0|0;
    $76 = $56;
    $77 = $56;
    $78 = (__ZNSt3__211char_traitsIcE6lengthEPKc($77)|0);
    $46 = $73;
    $47 = $76;
    $48 = $78;
    $79 = $46;
    $80 = $48;
    $44 = $79;
    $81 = $44;
    $43 = $81;
    $82 = $43;
    $42 = $82;
    $83 = $42;
    $41 = $83;
    $84 = $41;
    $39 = $84;
    $85 = $39;
    ;HEAP8[$38>>0]=HEAP8[$40>>0]|0;
    $37 = $85;
    $86 = $37;
    $36 = $86;
    $45 = -1;
    $87 = $45;
    $88 = (($87) - 16)|0;
    $89 = ($80>>>0)>($88>>>0);
    if ($89) {
     __THREW__ = 0;
     invoke_vi(45,($79|0));
     $90 = __THREW__; __THREW__ = 0;
     break;
    }
    $91 = $48;
    $92 = ($91>>>0)<(11);
    $93 = $48;
    if ($92) {
     $34 = $79;
     $35 = $93;
     $94 = $34;
     $95 = $35;
     $96 = $95&255;
     $33 = $94;
     $97 = $33;
     $32 = $97;
     $98 = $32;
     $99 = ((($98)) + 11|0);
     HEAP8[$99>>0] = $96;
     $31 = $79;
     $100 = $31;
     $30 = $100;
     $101 = $30;
     $29 = $101;
     $102 = $29;
     $28 = $102;
     $103 = $28;
     $27 = $103;
     $104 = $27;
     $49 = $104;
    } else {
     $6 = $93;
     $105 = $6;
     $106 = ($105>>>0)<(11);
     if ($106) {
      $113 = 11;
     } else {
      $107 = $6;
      $108 = (($107) + 1)|0;
      $5 = $108;
      $109 = $5;
      $110 = (($109) + 15)|0;
      $111 = $110 & -16;
      $113 = $111;
     }
     $112 = (($113) - 1)|0;
     $50 = $112;
     $4 = $79;
     $114 = $4;
     $3 = $114;
     $115 = $3;
     $2 = $115;
     $116 = $2;
     $117 = $50;
     $118 = (($117) + 1)|0;
     $12 = $116;
     $13 = $118;
     $119 = $12;
     $120 = $13;
     $9 = $119;
     $10 = $120;
     $11 = 0;
     $121 = $9;
     $8 = $121;
     $122 = $10;
     $7 = $122;
     $123 = $7;
     __THREW__ = 0;
     $124 = (invoke_ii(38,($123|0))|0);
     $125 = __THREW__; __THREW__ = 0;
     $126 = $125&1;
     if ($126) {
      break;
     }
     $49 = $124;
     $127 = $49;
     $16 = $79;
     $17 = $127;
     $128 = $16;
     $129 = $17;
     $15 = $128;
     $130 = $15;
     $14 = $130;
     $131 = $14;
     HEAP32[$131>>2] = $129;
     $132 = $50;
     $133 = (($132) + 1)|0;
     $20 = $79;
     $21 = $133;
     $134 = $20;
     $135 = $21;
     $136 = -2147483648 | $135;
     $19 = $134;
     $137 = $19;
     $18 = $137;
     $138 = $18;
     $139 = ((($138)) + 8|0);
     HEAP32[$139>>2] = $136;
     $140 = $48;
     $24 = $79;
     $25 = $140;
     $141 = $24;
     $142 = $25;
     $23 = $141;
     $143 = $23;
     $22 = $143;
     $144 = $22;
     $145 = ((($144)) + 4|0);
     HEAP32[$145>>2] = $142;
    }
    $146 = $49;
    $26 = $146;
    $147 = $26;
    $148 = $47;
    $149 = $48;
    (__ZNSt3__211char_traitsIcE4copyEPcPKcj($147,$148,$149)|0);
    $150 = $49;
    $151 = $48;
    $152 = (($150) + ($151)|0);
    HEAP8[$51>>0] = 0;
    __ZNSt3__211char_traitsIcE6assignERcRKc($152,$51);
    $$expand_i1_val2 = 1;
    HEAP8[$63>>0] = $$expand_i1_val2;
    $$pre_trunc = HEAP8[$63>>0]|0;
    $153 = $$pre_trunc&1;
    if ($153) {
     __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EED2Ev($59);
     __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEED2Ev($58);
     STACKTOP = sp;return;
    }
    __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($0);
    __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EED2Ev($59);
    __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEED2Ev($58);
    STACKTOP = sp;return;
   }
  }
 } while(0);
 $156 = ___cxa_find_matching_catch_2()|0;
 $157 = tempRet0;
 $60 = $156;
 $61 = $157;
 __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EED2Ev($59);
 __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEED2Ev($58);
 $158 = $60;
 $159 = $61;
 ___resumeException($158|0);
 // unreachable;
}
function __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEC2EPS3_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 $8 = $5;
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEEC2EPS2_j($6,$7,$8);
 STACKTOP = sp;return;
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EEC2ERS5_PS4_j($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = $4;
 $9 = $5;
 HEAP32[$8>>2] = $9;
 $10 = ((($8)) + 4|0);
 $11 = $6;
 $12 = $7;
 $13 = $12<<3;
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEEC2EPS2_j($10,$11,$13);
 $14 = ((($8)) + 28|0);
 HEAP32[$14>>2] = 324;
 $15 = ((($8)) + 32|0);
 HEAP8[$15>>0] = 0;
 STACKTOP = sp;return;
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE6AcceptINS_6WriterINS_19GenericStringBufferIS2_S4_EES2_S2_S4_Lj0EEEEEbRT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$byval_copy = 0, $$expand_i1_val = 0, $$expand_i1_val10 = 0, $$expand_i1_val12 = 0, $$expand_i1_val14 = 0, $$expand_i1_val16 = 0, $$expand_i1_val18 = 0, $$expand_i1_val2 = 0, $$expand_i1_val20 = 0, $$expand_i1_val22 = 0, $$expand_i1_val24 = 0, $$expand_i1_val26 = 0, $$expand_i1_val28 = 0, $$expand_i1_val30 = 0, $$expand_i1_val4 = 0, $$expand_i1_val6 = 0, $$expand_i1_val8 = 0, $$pre_trunc = 0, $10 = 0, $100 = 0;
 var $101 = 0, $102 = 0, $103 = 0, $104 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0;
 var $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0;
 var $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0.0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0;
 var $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $$byval_copy = sp + 20|0;
 $2 = sp + 24|0;
 $5 = sp + 8|0;
 $6 = sp + 4|0;
 $3 = $0;
 $4 = $1;
 $8 = $3;
 $9 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE7GetTypeEv($8)|0);
 switch ($9|0) {
 case 0:  {
  $10 = $4;
  $11 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE4NullEv($10)|0);
  $$expand_i1_val = $11&1;
  HEAP8[$2>>0] = $$expand_i1_val;
  $$pre_trunc = HEAP8[$2>>0]|0;
  $104 = $$pre_trunc&1;
  STACKTOP = sp;return ($104|0);
  break;
 }
 case 1:  {
  $12 = $4;
  $13 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE4BoolEb($12,0)|0);
  $$expand_i1_val2 = $13&1;
  HEAP8[$2>>0] = $$expand_i1_val2;
  $$pre_trunc = HEAP8[$2>>0]|0;
  $104 = $$pre_trunc&1;
  STACKTOP = sp;return ($104|0);
  break;
 }
 case 2:  {
  $14 = $4;
  $15 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE4BoolEb($14,1)|0);
  $$expand_i1_val4 = $15&1;
  HEAP8[$2>>0] = $$expand_i1_val4;
  $$pre_trunc = HEAP8[$2>>0]|0;
  $104 = $$pre_trunc&1;
  STACKTOP = sp;return ($104|0);
  break;
 }
 case 3:  {
  $16 = $4;
  $17 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE11StartObjectEv($16)|0);
  $18 = $17 ^ 1;
  $19 = $18 ^ 1;
  $20 = $19 ^ 1;
  if ($20) {
   $$expand_i1_val6 = 0;
   HEAP8[$2>>0] = $$expand_i1_val6;
   $$pre_trunc = HEAP8[$2>>0]|0;
   $104 = $$pre_trunc&1;
   STACKTOP = sp;return ($104|0);
  }
  $21 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE11MemberBeginEv($8)|0);
  HEAP32[$5>>2] = $21;
  while(1) {
   $22 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9MemberEndEv($8)|0);
   HEAP32[$6>>2] = $22;
   ;HEAP32[$$byval_copy>>2]=HEAP32[$6>>2]|0;
   $23 = (__ZNK9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEneES6_($5,$$byval_copy)|0);
   if (!($23)) {
    label = 16;
    break;
   }
   $24 = (__ZNK9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEptEv($5)|0);
   $25 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsStringEv($24)|0);
   if (!($25)) {
    label = 10;
    break;
   }
   $26 = $4;
   $27 = (__ZNK9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEptEv($5)|0);
   $28 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9GetStringEv($27)|0);
   $29 = (__ZNK9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEptEv($5)|0);
   $30 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE15GetStringLengthEv($29)|0);
   $31 = (__ZNK9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEptEv($5)|0);
   $32 = ((($31)) + 18|0);
   $33 = HEAP16[$32>>1]|0;
   $34 = $33&65535;
   $35 = $34 & 2048;
   $36 = ($35|0)!=(0);
   $37 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE3KeyEPKcjb($26,$28,$30,$36)|0);
   $38 = $37 ^ 1;
   $39 = $38 ^ 1;
   $40 = $39 ^ 1;
   if ($40) {
    label = 12;
    break;
   }
   $41 = (__ZNK9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEptEv($5)|0);
   $42 = ((($41)) + 24|0);
   $43 = $4;
   $44 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE6AcceptINS_6WriterINS_19GenericStringBufferIS2_S4_EES2_S2_S4_Lj0EEEEEbRT_($42,$43)|0);
   $45 = $44 ^ 1;
   $46 = $45 ^ 1;
   $47 = $46 ^ 1;
   if ($47) {
    label = 14;
    break;
   }
   (__ZN9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEppEv($5)|0);
  }
  if ((label|0) == 10) {
   ___assert_fail((6109|0),(4920|0),1850,(6128|0));
   // unreachable;
  }
  else if ((label|0) == 12) {
   $$expand_i1_val8 = 0;
   HEAP8[$2>>0] = $$expand_i1_val8;
   $$pre_trunc = HEAP8[$2>>0]|0;
   $104 = $$pre_trunc&1;
   STACKTOP = sp;return ($104|0);
  }
  else if ((label|0) == 14) {
   $$expand_i1_val10 = 0;
   HEAP8[$2>>0] = $$expand_i1_val10;
   $$pre_trunc = HEAP8[$2>>0]|0;
   $104 = $$pre_trunc&1;
   STACKTOP = sp;return ($104|0);
  }
  else if ((label|0) == 16) {
   $48 = $4;
   $49 = HEAP32[$8>>2]|0;
   $50 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE9EndObjectEj($48,$49)|0);
   $$expand_i1_val12 = $50&1;
   HEAP8[$2>>0] = $$expand_i1_val12;
   $$pre_trunc = HEAP8[$2>>0]|0;
   $104 = $$pre_trunc&1;
   STACKTOP = sp;return ($104|0);
  }
  break;
 }
 case 4:  {
  $51 = $4;
  $52 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE10StartArrayEv($51)|0);
  $53 = $52 ^ 1;
  $54 = $53 ^ 1;
  $55 = $54 ^ 1;
  if ($55) {
   $$expand_i1_val14 = 0;
   HEAP8[$2>>0] = $$expand_i1_val14;
   $$pre_trunc = HEAP8[$2>>0]|0;
   $104 = $$pre_trunc&1;
   STACKTOP = sp;return ($104|0);
  }
  $56 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE5BeginEv($8)|0);
  $7 = $56;
  while(1) {
   $57 = $7;
   $58 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE3EndEv($8)|0);
   $59 = ($57|0)!=($58|0);
   if (!($59)) {
    label = 24;
    break;
   }
   $60 = $7;
   $61 = $4;
   $62 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE6AcceptINS_6WriterINS_19GenericStringBufferIS2_S4_EES2_S2_S4_Lj0EEEEEbRT_($60,$61)|0);
   $63 = $62 ^ 1;
   $64 = $63 ^ 1;
   $65 = $64 ^ 1;
   if ($65) {
    label = 22;
    break;
   }
   $66 = $7;
   $67 = ((($66)) + 24|0);
   $7 = $67;
  }
  if ((label|0) == 22) {
   $$expand_i1_val16 = 0;
   HEAP8[$2>>0] = $$expand_i1_val16;
   $$pre_trunc = HEAP8[$2>>0]|0;
   $104 = $$pre_trunc&1;
   STACKTOP = sp;return ($104|0);
  }
  else if ((label|0) == 24) {
   $68 = $4;
   $69 = HEAP32[$8>>2]|0;
   $70 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE8EndArrayEj($68,$69)|0);
   $$expand_i1_val18 = $70&1;
   HEAP8[$2>>0] = $$expand_i1_val18;
   $$pre_trunc = HEAP8[$2>>0]|0;
   $104 = $$pre_trunc&1;
   STACKTOP = sp;return ($104|0);
  }
  break;
 }
 case 5:  {
  $71 = $4;
  $72 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9GetStringEv($8)|0);
  $73 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE15GetStringLengthEv($8)|0);
  $74 = ((($8)) + 18|0);
  $75 = HEAP16[$74>>1]|0;
  $76 = $75&65535;
  $77 = $76 & 2048;
  $78 = ($77|0)!=(0);
  $79 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6StringEPKcjb($71,$72,$73,$78)|0);
  $$expand_i1_val20 = $79&1;
  HEAP8[$2>>0] = $$expand_i1_val20;
  $$pre_trunc = HEAP8[$2>>0]|0;
  $104 = $$pre_trunc&1;
  STACKTOP = sp;return ($104|0);
  break;
 }
 default: {
  $80 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE7GetTypeEv($8)|0);
  $81 = ($80|0)==(6);
  if (!($81)) {
   ___assert_fail((6135|0),(4920|0),1870,(6128|0));
   // unreachable;
  }
  $82 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsDoubleEv($8)|0);
  if ($82) {
   $83 = $4;
   $84 = +HEAPF64[$8>>3];
   $85 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6DoubleEd($83,$84)|0);
   $$expand_i1_val22 = $85&1;
   HEAP8[$2>>0] = $$expand_i1_val22;
   $$pre_trunc = HEAP8[$2>>0]|0;
   $104 = $$pre_trunc&1;
   STACKTOP = sp;return ($104|0);
  }
  $86 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE5IsIntEv($8)|0);
  if ($86) {
   $87 = $4;
   $88 = HEAP32[$8>>2]|0;
   $89 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE3IntEi($87,$88)|0);
   $$expand_i1_val24 = $89&1;
   HEAP8[$2>>0] = $$expand_i1_val24;
   $$pre_trunc = HEAP8[$2>>0]|0;
   $104 = $$pre_trunc&1;
   STACKTOP = sp;return ($104|0);
  }
  $90 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE6IsUintEv($8)|0);
  if ($90) {
   $91 = $4;
   $92 = HEAP32[$8>>2]|0;
   $93 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE4UintEj($91,$92)|0);
   $$expand_i1_val26 = $93&1;
   HEAP8[$2>>0] = $$expand_i1_val26;
   $$pre_trunc = HEAP8[$2>>0]|0;
   $104 = $$pre_trunc&1;
   STACKTOP = sp;return ($104|0);
  }
  $94 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE7IsInt64Ev($8)|0);
  $95 = $4;
  $96 = $8;
  $97 = $96;
  $98 = HEAP32[$97>>2]|0;
  $99 = (($96) + 4)|0;
  $100 = $99;
  $101 = HEAP32[$100>>2]|0;
  if ($94) {
   $102 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE5Int64Ex($95,$98,$101)|0);
   $$expand_i1_val28 = $102&1;
   HEAP8[$2>>0] = $$expand_i1_val28;
   $$pre_trunc = HEAP8[$2>>0]|0;
   $104 = $$pre_trunc&1;
   STACKTOP = sp;return ($104|0);
  } else {
   $103 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6Uint64Ey($95,$98,$101)|0);
   $$expand_i1_val30 = $103&1;
   HEAP8[$2>>0] = $$expand_i1_val30;
   $$pre_trunc = HEAP8[$2>>0]|0;
   $104 = $$pre_trunc&1;
   STACKTOP = sp;return ($104|0);
  }
 }
 }
 return (0)|0;
}
function __ZNK9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE9GetStringEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushIcEEPT_j($2,1)|0);
 HEAP8[$3>>0] = 0;
 (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3PopIcEEPT_j($2,1)|0);
 $4 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE6BottomIcEEPT_v($2)|0);
 STACKTOP = sp;return ($4|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 4|0);
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEED2Ev($3);
 STACKTOP = sp;return;
}
function __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEED2Ev($2);
 STACKTOP = sp;return;
}
function __ZN6MyJson7SetNameERKNSt3__212basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $17 = $0;
 $18 = $1;
 $19 = $17;
 $20 = ((($19)) + 64|0);
 $21 = HEAP32[$20>>2]|0;
 $22 = $18;
 $16 = $22;
 $23 = $16;
 $15 = $23;
 $24 = $15;
 $14 = $24;
 $25 = $14;
 $13 = $25;
 $26 = $13;
 $12 = $26;
 $27 = $12;
 $11 = $27;
 $28 = $11;
 $29 = ((($28)) + 11|0);
 $30 = HEAP8[$29>>0]|0;
 $31 = $30&255;
 $32 = $31 & 128;
 $33 = ($32|0)!=(0);
 if ($33) {
  $5 = $25;
  $34 = $5;
  $4 = $34;
  $35 = $4;
  $3 = $35;
  $36 = $3;
  $37 = HEAP32[$36>>2]|0;
  $43 = $37;
 } else {
  $10 = $25;
  $38 = $10;
  $9 = $38;
  $39 = $9;
  $8 = $39;
  $40 = $8;
  $7 = $40;
  $41 = $7;
  $6 = $41;
  $42 = $6;
  $43 = $42;
 }
 $2 = $43;
 $44 = $2;
 $45 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E12GetAllocatorEv($19)|0);
 (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9SetStringEPKcRS5_($21,$44,$45)|0);
 STACKTOP = sp;return;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9SetStringEPKcRS5_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $6 = sp;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = $3;
 $8 = $4;
 __ZN9rapidjson9StringRefIcEENS_16GenericStringRefIT_EEPKS2_($6,$8);
 $9 = $5;
 $10 = (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9SetStringENS_16GenericStringRefIcEERS5_($7,$6,$9)|0);
 STACKTOP = sp;return ($10|0);
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E12GetAllocatorEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 24|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)!=(0|0);
 if ($5) {
  $6 = ((($2)) + 24|0);
  $7 = HEAP32[$6>>2]|0;
  STACKTOP = sp;return ($7|0);
 } else {
  ___assert_fail((4971|0),(4920|0),2385,(5027|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN6MyJson9SetSupplyERKi($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = ((($4)) + 68|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $3;
 $8 = HEAP32[$7>>2]|0;
 (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE6SetIntEi($6,$8)|0);
 STACKTOP = sp;return;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE6SetIntEi($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($4);
 $5 = $3;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2Ei($4,$5);
 STACKTOP = sp;return ($4|0);
}
function __ZN6MyJson10Add_KeyIntERKNSt3__212basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEERKi($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0;
 var $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 176|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(176|0);
 $31 = sp + 24|0;
 $32 = sp;
 $28 = $0;
 $29 = $1;
 $30 = $2;
 $35 = $28;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2ENS_4TypeE($31,6);
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2Ev($32);
 $36 = $29;
 $27 = $36;
 $37 = $27;
 $26 = $37;
 $38 = $26;
 $25 = $38;
 $39 = $25;
 $24 = $39;
 $40 = $24;
 $23 = $40;
 $41 = $23;
 $22 = $41;
 $42 = $22;
 $43 = ((($42)) + 11|0);
 $44 = HEAP8[$43>>0]|0;
 $45 = $44&255;
 $46 = $45 & 128;
 $47 = ($46|0)!=(0);
 if ($47) {
  $16 = $39;
  $48 = $16;
  $15 = $48;
  $49 = $15;
  $14 = $49;
  $50 = $14;
  $51 = HEAP32[$50>>2]|0;
  $57 = $51;
 } else {
  $21 = $39;
  $52 = $21;
  $20 = $52;
  $53 = $20;
  $19 = $53;
  $54 = $19;
  $18 = $54;
  $55 = $18;
  $17 = $55;
  $56 = $17;
  $57 = $56;
 }
 $13 = $57;
 $58 = $13;
 $59 = $29;
 $12 = $59;
 $60 = $12;
 $11 = $60;
 $61 = $11;
 $10 = $61;
 $62 = $10;
 $9 = $62;
 $63 = $9;
 $64 = ((($63)) + 11|0);
 $65 = HEAP8[$64>>0]|0;
 $66 = $65&255;
 $67 = $66 & 128;
 $68 = ($67|0)!=(0);
 if ($68) {
  $5 = $60;
  $69 = $5;
  $4 = $69;
  $70 = $4;
  $3 = $70;
  $71 = $3;
  $72 = ((($71)) + 4|0);
  $73 = HEAP32[$72>>2]|0;
  $83 = $73;
 } else {
  $8 = $60;
  $74 = $8;
  $7 = $74;
  $75 = $7;
  $6 = $75;
  $76 = $6;
  $77 = ((($76)) + 11|0);
  $78 = HEAP8[$77>>0]|0;
  $79 = $78&255;
  $83 = $79;
 }
 __THREW__ = 0;
 $80 = (invoke_ii(46,($35|0))|0);
 $81 = __THREW__; __THREW__ = 0;
 $82 = $81&1;
 if (!($82)) {
  __THREW__ = 0;
  (invoke_iiiii(47,($32|0),($58|0),($83|0),($80|0))|0);
  $84 = __THREW__; __THREW__ = 0;
  $85 = $84&1;
  if (!($85)) {
   $86 = $30;
   $87 = HEAP32[$86>>2]|0;
   __THREW__ = 0;
   (invoke_iii(48,($31|0),($87|0))|0);
   $88 = __THREW__; __THREW__ = 0;
   $89 = $88&1;
   if (!($89)) {
    __THREW__ = 0;
    $90 = (invoke_ii(46,($35|0))|0);
    $91 = __THREW__; __THREW__ = 0;
    $92 = $91&1;
    if (!($92)) {
     __THREW__ = 0;
     (invoke_iiiii(49,($35|0),($32|0),($31|0),($90|0))|0);
     $93 = __THREW__; __THREW__ = 0;
     $94 = $93&1;
     if (!($94)) {
      __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($32);
      __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($31);
      STACKTOP = sp;return;
     }
    }
   }
  }
 }
 $95 = ___cxa_find_matching_catch_2()|0;
 $96 = tempRet0;
 $33 = $95;
 $34 = $96;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($32);
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($31);
 $97 = $33;
 $98 = $34;
 ___resumeException($97|0);
 // unreachable;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2ENS_4TypeE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 ;HEAP32[$4>>2]=0|0;HEAP32[$4+4>>2]=0|0;HEAP32[$4+8>>2]=0|0;HEAP32[$4+12>>2]=0|0;HEAP32[$4+16>>2]=0|0;HEAP32[$4+20>>2]=0|0;
 $5 = $3;
 $6 = ($5|0)>=(0);
 $7 = $3;
 $8 = ($7|0)<=(6);
 $or$cond = $6 & $8;
 if (!($or$cond)) {
  __THREW__ = 0;
  invoke_viiii(50,(6972|0),(4920|0),608,(7013|0));
  $9 = __THREW__; __THREW__ = 0;
  $18 = ___cxa_find_matching_catch_3(0|0)|0;
  $19 = tempRet0;
  ___clang_call_terminate($18);
  // unreachable;
 }
 $10 = $3;
 $11 = (4738 + ($10<<1)|0);
 $12 = HEAP16[$11>>1]|0;
 $13 = ((($4)) + 18|0);
 HEAP16[$13>>1] = $12;
 $14 = $3;
 $15 = ($14|0)==(5);
 if (!($15)) {
  STACKTOP = sp;return;
 }
 __THREW__ = 0;
 invoke_vii(51,($4|0),0);
 $16 = __THREW__; __THREW__ = 0;
 $17 = $16&1;
 if ($17) {
  $18 = ___cxa_find_matching_catch_3(0|0)|0;
  $19 = tempRet0;
  ___clang_call_terminate($18);
  // unreachable;
 } else {
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 ;HEAP32[$2>>2]=0|0;HEAP32[$2+4>>2]=0|0;HEAP32[$2+8>>2]=0|0;HEAP32[$2+12>>2]=0|0;HEAP32[$2+16>>2]=0|0;HEAP32[$2+20>>2]=0|0;
 $3 = ((($2)) + 18|0);
 HEAP16[$3>>1] = 0;
 STACKTOP = sp;return;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9SetStringEPKcjRS5_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $8 = sp;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $9 = $4;
 $10 = $5;
 $11 = $6;
 __ZN9rapidjson9StringRefIcEENS_16GenericStringRefIT_EEPKS2_j($8,$10,$11);
 $12 = $7;
 $13 = (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9SetStringENS_16GenericStringRefIcEERS5_($9,$8,$12)|0);
 STACKTOP = sp;return ($13|0);
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9AddMemberERS6_S7_RS5_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $10 = $4;
 $11 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsObjectEv($10)|0);
 if (!($11)) {
  ___assert_fail((5916|0),(4920|0),1260,(7026|0));
  // unreachable;
 }
 $12 = $5;
 $13 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsStringEv($12)|0);
 if (!($13)) {
  ___assert_fail((5938|0),(4920|0),1261,(7026|0));
  // unreachable;
 }
 $8 = $10;
 $14 = $8;
 $15 = HEAP32[$14>>2]|0;
 $16 = $8;
 $17 = ((($16)) + 4|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ($15>>>0)>=($18>>>0);
 if ($19) {
  $20 = $8;
  $21 = ((($20)) + 4|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = ($22|0)==(0);
  if ($23) {
   $34 = 16;
  } else {
   $24 = $8;
   $25 = ((($24)) + 4|0);
   $26 = HEAP32[$25>>2]|0;
   $27 = $8;
   $28 = ((($27)) + 4|0);
   $29 = HEAP32[$28>>2]|0;
   $30 = (($29) + 1)|0;
   $31 = (($30>>>0) / 2)&-1;
   $32 = (($26) + ($31))|0;
   $34 = $32;
  }
  $33 = $7;
  (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE13MemberReserveEjRS5_($10,$34,$33)|0);
 }
 $35 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE17GetMembersPointerEv($10)|0);
 $9 = $35;
 $36 = $9;
 $37 = $8;
 $38 = HEAP32[$37>>2]|0;
 $39 = (($36) + (($38*48)|0)|0);
 $40 = $5;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9RawAssignERS6_($39,$40);
 $41 = $9;
 $42 = $8;
 $43 = HEAP32[$42>>2]|0;
 $44 = (($41) + (($43*48)|0)|0);
 $45 = ((($44)) + 24|0);
 $46 = $6;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9RawAssignERS6_($45,$46);
 $47 = $8;
 $48 = HEAP32[$47>>2]|0;
 $49 = (($48) + 1)|0;
 HEAP32[$47>>2] = $49;
 STACKTOP = sp;return ($10|0);
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return;
}
function __ZN6MyJson13Add_KeyStringERKNSt3__212basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEES8_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $18 = 0, $19 = 0;
 var $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0;
 var $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0;
 var $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0;
 var $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0;
 var $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 272|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(272|0);
 $56 = sp + 24|0;
 $57 = sp;
 $53 = $0;
 $54 = $1;
 $55 = $2;
 $60 = $53;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2ENS_4TypeE($56,5);
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2ENS_4TypeE($57,5);
 $61 = $54;
 $52 = $61;
 $62 = $52;
 $51 = $62;
 $63 = $51;
 $50 = $63;
 $64 = $50;
 $49 = $64;
 $65 = $49;
 $48 = $65;
 $66 = $48;
 $47 = $66;
 $67 = $47;
 $68 = ((($67)) + 11|0);
 $69 = HEAP8[$68>>0]|0;
 $70 = $69&255;
 $71 = $70 & 128;
 $72 = ($71|0)!=(0);
 if ($72) {
  $41 = $64;
  $73 = $41;
  $40 = $73;
  $74 = $40;
  $39 = $74;
  $75 = $39;
  $76 = HEAP32[$75>>2]|0;
  $82 = $76;
 } else {
  $46 = $64;
  $77 = $46;
  $45 = $77;
  $78 = $45;
  $44 = $78;
  $79 = $44;
  $43 = $79;
  $80 = $43;
  $42 = $80;
  $81 = $42;
  $82 = $81;
 }
 $38 = $82;
 $83 = $38;
 $84 = $54;
 $37 = $84;
 $85 = $37;
 $36 = $85;
 $86 = $36;
 $35 = $86;
 $87 = $35;
 $34 = $87;
 $88 = $34;
 $89 = ((($88)) + 11|0);
 $90 = HEAP8[$89>>0]|0;
 $91 = $90&255;
 $92 = $91 & 128;
 $93 = ($92|0)!=(0);
 if ($93) {
  $30 = $85;
  $94 = $30;
  $29 = $94;
  $95 = $29;
  $28 = $95;
  $96 = $28;
  $97 = ((($96)) + 4|0);
  $98 = HEAP32[$97>>2]|0;
  $108 = $98;
 } else {
  $33 = $85;
  $99 = $33;
  $32 = $99;
  $100 = $32;
  $31 = $100;
  $101 = $31;
  $102 = ((($101)) + 11|0);
  $103 = HEAP8[$102>>0]|0;
  $104 = $103&255;
  $108 = $104;
 }
 __THREW__ = 0;
 $105 = (invoke_ii(46,($60|0))|0);
 $106 = __THREW__; __THREW__ = 0;
 $107 = $106&1;
 if (!($107)) {
  __THREW__ = 0;
  (invoke_iiiii(47,($56|0),($83|0),($108|0),($105|0))|0);
  $109 = __THREW__; __THREW__ = 0;
  $110 = $109&1;
  if (!($110)) {
   $111 = $55;
   $27 = $111;
   $112 = $27;
   $26 = $112;
   $113 = $26;
   $25 = $113;
   $114 = $25;
   $24 = $114;
   $115 = $24;
   $23 = $115;
   $116 = $23;
   $22 = $116;
   $117 = $22;
   $118 = ((($117)) + 11|0);
   $119 = HEAP8[$118>>0]|0;
   $120 = $119&255;
   $121 = $120 & 128;
   $122 = ($121|0)!=(0);
   if ($122) {
    $16 = $114;
    $123 = $16;
    $15 = $123;
    $124 = $15;
    $14 = $124;
    $125 = $14;
    $126 = HEAP32[$125>>2]|0;
    $132 = $126;
   } else {
    $21 = $114;
    $127 = $21;
    $20 = $127;
    $128 = $20;
    $19 = $128;
    $129 = $19;
    $18 = $129;
    $130 = $18;
    $17 = $130;
    $131 = $17;
    $132 = $131;
   }
   $13 = $132;
   $133 = $13;
   $134 = $55;
   $12 = $134;
   $135 = $12;
   $11 = $135;
   $136 = $11;
   $10 = $136;
   $137 = $10;
   $9 = $137;
   $138 = $9;
   $139 = ((($138)) + 11|0);
   $140 = HEAP8[$139>>0]|0;
   $141 = $140&255;
   $142 = $141 & 128;
   $143 = ($142|0)!=(0);
   if ($143) {
    $5 = $135;
    $144 = $5;
    $4 = $144;
    $145 = $4;
    $3 = $145;
    $146 = $3;
    $147 = ((($146)) + 4|0);
    $148 = HEAP32[$147>>2]|0;
    $158 = $148;
   } else {
    $8 = $135;
    $149 = $8;
    $7 = $149;
    $150 = $7;
    $6 = $150;
    $151 = $6;
    $152 = ((($151)) + 11|0);
    $153 = HEAP8[$152>>0]|0;
    $154 = $153&255;
    $158 = $154;
   }
   __THREW__ = 0;
   $155 = (invoke_ii(46,($60|0))|0);
   $156 = __THREW__; __THREW__ = 0;
   $157 = $156&1;
   if (!($157)) {
    __THREW__ = 0;
    (invoke_iiiii(47,($57|0),($133|0),($158|0),($155|0))|0);
    $159 = __THREW__; __THREW__ = 0;
    $160 = $159&1;
    if (!($160)) {
     __THREW__ = 0;
     $161 = (invoke_ii(46,($60|0))|0);
     $162 = __THREW__; __THREW__ = 0;
     $163 = $162&1;
     if (!($163)) {
      __THREW__ = 0;
      (invoke_iiiii(49,($60|0),($56|0),($57|0),($161|0))|0);
      $164 = __THREW__; __THREW__ = 0;
      $165 = $164&1;
      if (!($165)) {
       __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($57);
       __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($56);
       STACKTOP = sp;return;
      }
     }
    }
   }
  }
 }
 $166 = ___cxa_find_matching_catch_2()|0;
 $167 = tempRet0;
 $58 = $166;
 $59 = $167;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($57);
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($56);
 $168 = $58;
 $169 = $59;
 ___resumeException($168|0);
 // unreachable;
}
function __ZN6MyJson9Add_ArrayERKNSt3__212basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 STACKTOP = sp;return;
}
function ___cxx_global_var_init() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN35EmscriptenBindingInitializer_moduleC2Ev(12304);
 return;
}
function __ZN35EmscriptenBindingInitializer_moduleC2Ev($0) {
 $0 = $0|0;
 var $$field = 0, $$field11 = 0, $$field14 = 0, $$field21 = 0, $$field24 = 0, $$field31 = 0, $$field34 = 0, $$field4 = 0, $$field41 = 0, $$field44 = 0, $$field51 = 0, $$field54 = 0, $$field61 = 0, $$field64 = 0, $$field71 = 0, $$field74 = 0, $$field81 = 0, $$field84 = 0, $$field91 = 0, $$field94 = 0;
 var $$index1 = 0, $$index13 = 0, $$index17 = 0, $$index19 = 0, $$index23 = 0, $$index27 = 0, $$index29 = 0, $$index3 = 0, $$index33 = 0, $$index37 = 0, $$index39 = 0, $$index43 = 0, $$index47 = 0, $$index49 = 0, $$index53 = 0, $$index57 = 0, $$index59 = 0, $$index63 = 0, $$index67 = 0, $$index69 = 0;
 var $$index7 = 0, $$index73 = 0, $$index77 = 0, $$index79 = 0, $$index83 = 0, $$index87 = 0, $$index89 = 0, $$index9 = 0, $$index93 = 0, $$index97 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0;
 var $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0;
 var $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0;
 var $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0;
 var $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0;
 var $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0;
 var $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0;
 var $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0;
 var $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0;
 var $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0;
 var $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 480|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(480|0);
 $4 = sp + 448|0;
 $6 = sp + 479|0;
 $7 = sp + 72|0;
 $11 = sp + 424|0;
 $13 = sp + 478|0;
 $14 = sp + 64|0;
 $18 = sp + 400|0;
 $20 = sp + 477|0;
 $21 = sp + 56|0;
 $25 = sp + 376|0;
 $27 = sp + 476|0;
 $28 = sp + 48|0;
 $32 = sp + 352|0;
 $34 = sp + 475|0;
 $35 = sp + 40|0;
 $39 = sp + 328|0;
 $41 = sp + 474|0;
 $42 = sp + 32|0;
 $46 = sp + 304|0;
 $48 = sp + 473|0;
 $49 = sp + 24|0;
 $53 = sp + 280|0;
 $55 = sp + 472|0;
 $56 = sp + 16|0;
 $60 = sp + 256|0;
 $62 = sp + 471|0;
 $63 = sp + 8|0;
 $67 = sp + 232|0;
 $69 = sp + 470|0;
 $70 = sp;
 $74 = sp + 469|0;
 $88 = sp + 468|0;
 $89 = sp + 152|0;
 $90 = sp + 144|0;
 $91 = sp + 136|0;
 $92 = sp + 128|0;
 $93 = sp + 120|0;
 $94 = sp + 112|0;
 $95 = sp + 104|0;
 $96 = sp + 96|0;
 $97 = sp + 88|0;
 $98 = sp + 80|0;
 $87 = $0;
 $81 = $88;
 $82 = 4779;
 __ZN10emscripten8internal11NoBaseClass6verifyI6MyJsonEEvv();
 $83 = 52;
 $99 = (__ZN10emscripten8internal11NoBaseClass11getUpcasterI6MyJsonEEPFvvEv()|0);
 $84 = $99;
 $100 = (__ZN10emscripten8internal11NoBaseClass13getDowncasterI6MyJsonEEPFvvEv()|0);
 $85 = $100;
 $86 = 53;
 $101 = (__ZN10emscripten8internal6TypeIDI6MyJsonE3getEv()|0);
 $102 = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI6MyJsonEEE3getEv()|0);
 $103 = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK6MyJsonEEE3getEv()|0);
 $104 = (__ZN10emscripten8internal11NoBaseClass3getEv()|0);
 $105 = $83;
 $80 = $105;
 $106 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0);
 $107 = $83;
 $108 = $84;
 $79 = $108;
 $109 = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0);
 $110 = $84;
 $111 = $85;
 $78 = $111;
 $112 = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0);
 $113 = $85;
 $114 = $82;
 $115 = $86;
 $77 = $115;
 $116 = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0);
 $117 = $86;
 __embind_register_class(($101|0),($102|0),($103|0),($104|0),($106|0),($107|0),($109|0),($110|0),($112|0),($113|0),($114|0),($116|0),($117|0));
 $76 = $88;
 $118 = $76;
 $72 = $118;
 $73 = 54;
 $119 = $72;
 $75 = 55;
 $120 = (__ZN10emscripten8internal6TypeIDI6MyJsonE3getEv()|0);
 $121 = (__ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP6MyJsonRKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEEEE8getCountEv($74)|0);
 $122 = (__ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP6MyJsonRKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEEEE8getTypesEv($74)|0);
 $123 = $75;
 $71 = $123;
 $124 = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0);
 $125 = $75;
 $126 = $73;
 __embind_register_class_constructor(($120|0),($121|0),($122|0),($124|0),($125|0),($126|0));
 HEAP32[$89>>2] = (56);
 $$index1 = ((($89)) + 4|0);
 HEAP32[$$index1>>2] = 0;
 ;HEAP8[$70>>0]=HEAP8[$89>>0]|0;HEAP8[$70+1>>0]=HEAP8[$89+1>>0]|0;HEAP8[$70+2>>0]=HEAP8[$89+2>>0]|0;HEAP8[$70+3>>0]=HEAP8[$89+3>>0]|0;HEAP8[$70+4>>0]=HEAP8[$89+4>>0]|0;HEAP8[$70+5>>0]=HEAP8[$89+5>>0]|0;HEAP8[$70+6>>0]=HEAP8[$89+6>>0]|0;HEAP8[$70+7>>0]=HEAP8[$89+7>>0]|0;
 $$field = HEAP32[$70>>2]|0;
 $$index3 = ((($70)) + 4|0);
 $$field4 = HEAP32[$$index3>>2]|0;
 $65 = $119;
 $66 = 4786;
 HEAP32[$67>>2] = $$field;
 $$index7 = ((($67)) + 4|0);
 HEAP32[$$index7>>2] = $$field4;
 $127 = $65;
 $68 = 57;
 $128 = (__ZN10emscripten8internal6TypeIDI6MyJsonE3getEv()|0);
 $129 = $66;
 $130 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNSt3__212basic_stringIcNS4_11char_traitsIcEENS4_9allocatorIcEEEENS0_17AllowedRawPointerI6MyJsonEEEE8getCountEv($69)|0);
 $131 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNSt3__212basic_stringIcNS4_11char_traitsIcEENS4_9allocatorIcEEEENS0_17AllowedRawPointerI6MyJsonEEEE8getTypesEv($69)|0);
 $132 = $68;
 $64 = $132;
 $133 = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0);
 $134 = $68;
 $135 = (__ZN10emscripten8internal10getContextIM6MyJsonFNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEvEEEPT_RKSC_($67)|0);
 __embind_register_class_function(($128|0),($129|0),($130|0),($131|0),($133|0),($134|0),($135|0),0);
 HEAP32[$90>>2] = (58);
 $$index9 = ((($90)) + 4|0);
 HEAP32[$$index9>>2] = 0;
 ;HEAP8[$63>>0]=HEAP8[$90>>0]|0;HEAP8[$63+1>>0]=HEAP8[$90+1>>0]|0;HEAP8[$63+2>>0]=HEAP8[$90+2>>0]|0;HEAP8[$63+3>>0]=HEAP8[$90+3>>0]|0;HEAP8[$63+4>>0]=HEAP8[$90+4>>0]|0;HEAP8[$63+5>>0]=HEAP8[$90+5>>0]|0;HEAP8[$63+6>>0]=HEAP8[$90+6>>0]|0;HEAP8[$63+7>>0]=HEAP8[$90+7>>0]|0;
 $$field11 = HEAP32[$63>>2]|0;
 $$index13 = ((($63)) + 4|0);
 $$field14 = HEAP32[$$index13>>2]|0;
 $58 = $127;
 $59 = 4794;
 HEAP32[$60>>2] = $$field11;
 $$index17 = ((($60)) + 4|0);
 HEAP32[$$index17>>2] = $$field14;
 $136 = $58;
 $61 = 59;
 $137 = (__ZN10emscripten8internal6TypeIDI6MyJsonE3getEv()|0);
 $138 = $59;
 $139 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiNS0_17AllowedRawPointerI6MyJsonEEEE8getCountEv($62)|0);
 $140 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiNS0_17AllowedRawPointerI6MyJsonEEEE8getTypesEv($62)|0);
 $141 = $61;
 $57 = $141;
 $142 = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0);
 $143 = $61;
 $144 = (__ZN10emscripten8internal10getContextIM6MyJsonFivEEEPT_RKS5_($60)|0);
 __embind_register_class_function(($137|0),($138|0),($139|0),($140|0),($142|0),($143|0),($144|0),0);
 HEAP32[$91>>2] = (60);
 $$index19 = ((($91)) + 4|0);
 HEAP32[$$index19>>2] = 0;
 ;HEAP8[$56>>0]=HEAP8[$91>>0]|0;HEAP8[$56+1>>0]=HEAP8[$91+1>>0]|0;HEAP8[$56+2>>0]=HEAP8[$91+2>>0]|0;HEAP8[$56+3>>0]=HEAP8[$91+3>>0]|0;HEAP8[$56+4>>0]=HEAP8[$91+4>>0]|0;HEAP8[$56+5>>0]=HEAP8[$91+5>>0]|0;HEAP8[$56+6>>0]=HEAP8[$91+6>>0]|0;HEAP8[$56+7>>0]=HEAP8[$91+7>>0]|0;
 $$field21 = HEAP32[$56>>2]|0;
 $$index23 = ((($56)) + 4|0);
 $$field24 = HEAP32[$$index23>>2]|0;
 $51 = $136;
 $52 = 4804;
 HEAP32[$53>>2] = $$field21;
 $$index27 = ((($53)) + 4|0);
 HEAP32[$$index27>>2] = $$field24;
 $145 = $51;
 $54 = 61;
 $146 = (__ZN10emscripten8internal6TypeIDI6MyJsonE3getEv()|0);
 $147 = $52;
 $148 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEEEE8getCountEv($55)|0);
 $149 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEEEE8getTypesEv($55)|0);
 $150 = $54;
 $50 = $150;
 $151 = (__ZN10emscripten8internal19getGenericSignatureIJiiiiEEEPKcv()|0);
 $152 = $54;
 $153 = (__ZN10emscripten8internal10getContextIM6MyJsonFiRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEEEEPT_RKSE_($53)|0);
 __embind_register_class_function(($146|0),($147|0),($148|0),($149|0),($151|0),($152|0),($153|0),0);
 HEAP32[$92>>2] = (62);
 $$index29 = ((($92)) + 4|0);
 HEAP32[$$index29>>2] = 0;
 ;HEAP8[$49>>0]=HEAP8[$92>>0]|0;HEAP8[$49+1>>0]=HEAP8[$92+1>>0]|0;HEAP8[$49+2>>0]=HEAP8[$92+2>>0]|0;HEAP8[$49+3>>0]=HEAP8[$92+3>>0]|0;HEAP8[$49+4>>0]=HEAP8[$92+4>>0]|0;HEAP8[$49+5>>0]=HEAP8[$92+5>>0]|0;HEAP8[$49+6>>0]=HEAP8[$92+6>>0]|0;HEAP8[$49+7>>0]=HEAP8[$92+7>>0]|0;
 $$field31 = HEAP32[$49>>2]|0;
 $$index33 = ((($49)) + 4|0);
 $$field34 = HEAP32[$$index33>>2]|0;
 $44 = $145;
 $45 = 4811;
 HEAP32[$46>>2] = $$field31;
 $$index37 = ((($46)) + 4|0);
 HEAP32[$$index37>>2] = $$field34;
 $154 = $44;
 $47 = 61;
 $155 = (__ZN10emscripten8internal6TypeIDI6MyJsonE3getEv()|0);
 $156 = $45;
 $157 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEEEE8getCountEv($48)|0);
 $158 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEEEE8getTypesEv($48)|0);
 $159 = $47;
 $43 = $159;
 $160 = (__ZN10emscripten8internal19getGenericSignatureIJiiiiEEEPKcv()|0);
 $161 = $47;
 $162 = (__ZN10emscripten8internal10getContextIM6MyJsonFiRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEEEEPT_RKSE_($46)|0);
 __embind_register_class_function(($155|0),($156|0),($157|0),($158|0),($160|0),($161|0),($162|0),0);
 HEAP32[$93>>2] = (63);
 $$index39 = ((($93)) + 4|0);
 HEAP32[$$index39>>2] = 0;
 ;HEAP8[$42>>0]=HEAP8[$93>>0]|0;HEAP8[$42+1>>0]=HEAP8[$93+1>>0]|0;HEAP8[$42+2>>0]=HEAP8[$93+2>>0]|0;HEAP8[$42+3>>0]=HEAP8[$93+3>>0]|0;HEAP8[$42+4>>0]=HEAP8[$93+4>>0]|0;HEAP8[$42+5>>0]=HEAP8[$93+5>>0]|0;HEAP8[$42+6>>0]=HEAP8[$93+6>>0]|0;HEAP8[$42+7>>0]=HEAP8[$93+7>>0]|0;
 $$field41 = HEAP32[$42>>2]|0;
 $$index43 = ((($42)) + 4|0);
 $$field44 = HEAP32[$$index43>>2]|0;
 $37 = $154;
 $38 = 4819;
 HEAP32[$39>>2] = $$field41;
 $$index47 = ((($39)) + 4|0);
 HEAP32[$$index47>>2] = $$field44;
 $163 = $37;
 $40 = 57;
 $164 = (__ZN10emscripten8internal6TypeIDI6MyJsonE3getEv()|0);
 $165 = $38;
 $166 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNSt3__212basic_stringIcNS4_11char_traitsIcEENS4_9allocatorIcEEEENS0_17AllowedRawPointerI6MyJsonEEEE8getCountEv($41)|0);
 $167 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNSt3__212basic_stringIcNS4_11char_traitsIcEENS4_9allocatorIcEEEENS0_17AllowedRawPointerI6MyJsonEEEE8getTypesEv($41)|0);
 $168 = $40;
 $36 = $168;
 $169 = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0);
 $170 = $40;
 $171 = (__ZN10emscripten8internal10getContextIM6MyJsonFNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEvEEEPT_RKSC_($39)|0);
 __embind_register_class_function(($164|0),($165|0),($166|0),($167|0),($169|0),($170|0),($171|0),0);
 HEAP32[$94>>2] = (64);
 $$index49 = ((($94)) + 4|0);
 HEAP32[$$index49>>2] = 0;
 ;HEAP8[$35>>0]=HEAP8[$94>>0]|0;HEAP8[$35+1>>0]=HEAP8[$94+1>>0]|0;HEAP8[$35+2>>0]=HEAP8[$94+2>>0]|0;HEAP8[$35+3>>0]=HEAP8[$94+3>>0]|0;HEAP8[$35+4>>0]=HEAP8[$94+4>>0]|0;HEAP8[$35+5>>0]=HEAP8[$94+5>>0]|0;HEAP8[$35+6>>0]=HEAP8[$94+6>>0]|0;HEAP8[$35+7>>0]=HEAP8[$94+7>>0]|0;
 $$field51 = HEAP32[$35>>2]|0;
 $$index53 = ((($35)) + 4|0);
 $$field54 = HEAP32[$$index53>>2]|0;
 $30 = $163;
 $31 = 4829;
 HEAP32[$32>>2] = $$field51;
 $$index57 = ((($32)) + 4|0);
 HEAP32[$$index57>>2] = $$field54;
 $172 = $30;
 $33 = 65;
 $173 = (__ZN10emscripten8internal6TypeIDI6MyJsonE3getEv()|0);
 $174 = $31;
 $175 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEEEE8getCountEv($34)|0);
 $176 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEEEE8getTypesEv($34)|0);
 $177 = $33;
 $29 = $177;
 $178 = (__ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv()|0);
 $179 = $33;
 $180 = (__ZN10emscripten8internal10getContextIM6MyJsonFvRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEEEEPT_RKSE_($32)|0);
 __embind_register_class_function(($173|0),($174|0),($175|0),($176|0),($178|0),($179|0),($180|0),0);
 HEAP32[$95>>2] = (66);
 $$index59 = ((($95)) + 4|0);
 HEAP32[$$index59>>2] = 0;
 ;HEAP8[$28>>0]=HEAP8[$95>>0]|0;HEAP8[$28+1>>0]=HEAP8[$95+1>>0]|0;HEAP8[$28+2>>0]=HEAP8[$95+2>>0]|0;HEAP8[$28+3>>0]=HEAP8[$95+3>>0]|0;HEAP8[$28+4>>0]=HEAP8[$95+4>>0]|0;HEAP8[$28+5>>0]=HEAP8[$95+5>>0]|0;HEAP8[$28+6>>0]=HEAP8[$95+6>>0]|0;HEAP8[$28+7>>0]=HEAP8[$95+7>>0]|0;
 $$field61 = HEAP32[$28>>2]|0;
 $$index63 = ((($28)) + 4|0);
 $$field64 = HEAP32[$$index63>>2]|0;
 $23 = $172;
 $24 = 4837;
 HEAP32[$25>>2] = $$field61;
 $$index67 = ((($25)) + 4|0);
 HEAP32[$$index67>>2] = $$field64;
 $181 = $23;
 $26 = 67;
 $182 = (__ZN10emscripten8internal6TypeIDI6MyJsonE3getEv()|0);
 $183 = $24;
 $184 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKiEE8getCountEv($27)|0);
 $185 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKiEE8getTypesEv($27)|0);
 $186 = $26;
 $22 = $186;
 $187 = (__ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv()|0);
 $188 = $26;
 $189 = (__ZN10emscripten8internal10getContextIM6MyJsonFvRKiEEEPT_RKS7_($25)|0);
 __embind_register_class_function(($182|0),($183|0),($184|0),($185|0),($187|0),($188|0),($189|0),0);
 HEAP32[$96>>2] = (68);
 $$index69 = ((($96)) + 4|0);
 HEAP32[$$index69>>2] = 0;
 ;HEAP8[$21>>0]=HEAP8[$96>>0]|0;HEAP8[$21+1>>0]=HEAP8[$96+1>>0]|0;HEAP8[$21+2>>0]=HEAP8[$96+2>>0]|0;HEAP8[$21+3>>0]=HEAP8[$96+3>>0]|0;HEAP8[$21+4>>0]=HEAP8[$96+4>>0]|0;HEAP8[$21+5>>0]=HEAP8[$96+5>>0]|0;HEAP8[$21+6>>0]=HEAP8[$96+6>>0]|0;HEAP8[$21+7>>0]=HEAP8[$96+7>>0]|0;
 $$field71 = HEAP32[$21>>2]|0;
 $$index73 = ((($21)) + 4|0);
 $$field74 = HEAP32[$$index73>>2]|0;
 $16 = $181;
 $17 = 4847;
 HEAP32[$18>>2] = $$field71;
 $$index77 = ((($18)) + 4|0);
 HEAP32[$$index77>>2] = $$field74;
 $190 = $16;
 $19 = 69;
 $191 = (__ZN10emscripten8internal6TypeIDI6MyJsonE3getEv()|0);
 $192 = $17;
 $193 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEERKiEE8getCountEv($20)|0);
 $194 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEERKiEE8getTypesEv($20)|0);
 $195 = $19;
 $15 = $195;
 $196 = (__ZN10emscripten8internal19getGenericSignatureIJviiiiEEEPKcv()|0);
 $197 = $19;
 $198 = (__ZN10emscripten8internal10getContextIM6MyJsonFvRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEERKiEEEPT_RKSG_($18)|0);
 __embind_register_class_function(($191|0),($192|0),($193|0),($194|0),($196|0),($197|0),($198|0),0);
 HEAP32[$97>>2] = (70);
 $$index79 = ((($97)) + 4|0);
 HEAP32[$$index79>>2] = 0;
 ;HEAP8[$14>>0]=HEAP8[$97>>0]|0;HEAP8[$14+1>>0]=HEAP8[$97+1>>0]|0;HEAP8[$14+2>>0]=HEAP8[$97+2>>0]|0;HEAP8[$14+3>>0]=HEAP8[$97+3>>0]|0;HEAP8[$14+4>>0]=HEAP8[$97+4>>0]|0;HEAP8[$14+5>>0]=HEAP8[$97+5>>0]|0;HEAP8[$14+6>>0]=HEAP8[$97+6>>0]|0;HEAP8[$14+7>>0]=HEAP8[$97+7>>0]|0;
 $$field81 = HEAP32[$14>>2]|0;
 $$index83 = ((($14)) + 4|0);
 $$field84 = HEAP32[$$index83>>2]|0;
 $9 = $190;
 $10 = 4858;
 HEAP32[$11>>2] = $$field81;
 $$index87 = ((($11)) + 4|0);
 HEAP32[$$index87>>2] = $$field84;
 $199 = $9;
 $12 = 71;
 $200 = (__ZN10emscripten8internal6TypeIDI6MyJsonE3getEv()|0);
 $201 = $10;
 $202 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEESF_EE8getCountEv($13)|0);
 $203 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEESF_EE8getTypesEv($13)|0);
 $204 = $12;
 $8 = $204;
 $205 = (__ZN10emscripten8internal19getGenericSignatureIJviiiiEEEPKcv()|0);
 $206 = $12;
 $207 = (__ZN10emscripten8internal10getContextIM6MyJsonFvRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEESB_EEEPT_RKSE_($11)|0);
 __embind_register_class_function(($200|0),($201|0),($202|0),($203|0),($205|0),($206|0),($207|0),0);
 HEAP32[$98>>2] = (72);
 $$index89 = ((($98)) + 4|0);
 HEAP32[$$index89>>2] = 0;
 ;HEAP8[$7>>0]=HEAP8[$98>>0]|0;HEAP8[$7+1>>0]=HEAP8[$98+1>>0]|0;HEAP8[$7+2>>0]=HEAP8[$98+2>>0]|0;HEAP8[$7+3>>0]=HEAP8[$98+3>>0]|0;HEAP8[$7+4>>0]=HEAP8[$98+4>>0]|0;HEAP8[$7+5>>0]=HEAP8[$98+5>>0]|0;HEAP8[$7+6>>0]=HEAP8[$98+6>>0]|0;HEAP8[$7+7>>0]=HEAP8[$98+7>>0]|0;
 $$field91 = HEAP32[$7>>2]|0;
 $$index93 = ((($7)) + 4|0);
 $$field94 = HEAP32[$$index93>>2]|0;
 $2 = $199;
 $3 = 4872;
 HEAP32[$4>>2] = $$field91;
 $$index97 = ((($4)) + 4|0);
 HEAP32[$$index97>>2] = $$field94;
 $5 = 65;
 $208 = (__ZN10emscripten8internal6TypeIDI6MyJsonE3getEv()|0);
 $209 = $3;
 $210 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEEEE8getCountEv($6)|0);
 $211 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEEEE8getTypesEv($6)|0);
 $212 = $5;
 $1 = $212;
 $213 = (__ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv()|0);
 $214 = $5;
 $215 = (__ZN10emscripten8internal10getContextIM6MyJsonFvRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEEEEPT_RKSE_($4)|0);
 __embind_register_class_function(($208|0),($209|0),($210|0),($211|0),($213|0),($214|0),($215|0),0);
 STACKTOP = sp;return;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __THREW__ = 0;
 invoke_vi(73,($2|0));
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_3(0|0)|0;
  $6 = tempRet0;
  ___clang_call_terminate($5);
  // unreachable;
 } else {
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE7DestroyEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 __ZN9rapidjson12CrtAllocator4FreeEPv($4);
 $5 = ((($2)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)==(0|0);
 if ($7) {
  STACKTOP = sp;return;
 }
 __ZdlPv($6);
 STACKTOP = sp;return;
}
function ___clang_call_terminate($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 (___cxa_begin_catch(($0|0))|0);
 __ZSt9terminatev();
 // unreachable;
}
function __ZN9rapidjson12CrtAllocator4FreeEPv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 _free($2);
 STACKTOP = sp;return;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEEC2EPS2_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 HEAP32[$6>>2] = $7;
 $8 = ((($6)) + 4|0);
 HEAP32[$8>>2] = 0;
 $9 = ((($6)) + 8|0);
 HEAP32[$9>>2] = 0;
 $10 = ((($6)) + 12|0);
 HEAP32[$10>>2] = 0;
 $11 = ((($6)) + 16|0);
 HEAP32[$11>>2] = 0;
 $12 = ((($6)) + 20|0);
 $13 = $5;
 HEAP32[$12>>2] = $13;
 STACKTOP = sp;return;
}
function __ZN9rapidjson11ParseResultC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 HEAP32[$2>>2] = 0;
 $3 = ((($2)) + 4|0);
 HEAP32[$3>>2] = 0;
 STACKTOP = sp;return;
}
function __ZN9rapidjson19MemoryPoolAllocatorINS_12CrtAllocatorEEC2EjPS1_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 HEAP32[$6>>2] = 0;
 $7 = ((($6)) + 4|0);
 $8 = $4;
 HEAP32[$7>>2] = $8;
 $9 = ((($6)) + 8|0);
 HEAP32[$9>>2] = 0;
 $10 = ((($6)) + 12|0);
 $11 = $5;
 HEAP32[$10>>2] = $11;
 $12 = ((($6)) + 16|0);
 HEAP32[$12>>2] = 0;
 STACKTOP = sp;return;
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E7DestroyEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 28|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(0|0);
 if ($5) {
  STACKTOP = sp;return;
 }
 __ZN9rapidjson19MemoryPoolAllocatorINS_12CrtAllocatorEED2Ev($4);
 __ZdlPv($4);
 STACKTOP = sp;return;
}
function __ZN9rapidjson19MemoryPoolAllocatorINS_12CrtAllocatorEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __THREW__ = 0;
 invoke_vi(74,($2|0));
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $8 = ___cxa_find_matching_catch_3(0|0)|0;
  $9 = tempRet0;
  ___clang_call_terminate($8);
  // unreachable;
 }
 $5 = ((($2)) + 16|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)==(0|0);
 if ($7) {
  STACKTOP = sp;return;
 }
 __ZdlPv($6);
 STACKTOP = sp;return;
}
function __ZN9rapidjson19MemoryPoolAllocatorINS_12CrtAllocatorEE5ClearEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $3 = $1;
 while(1) {
  $4 = HEAP32[$3>>2]|0;
  $5 = ($4|0)!=(0|0);
  if ($5) {
   $6 = HEAP32[$3>>2]|0;
   $7 = ((($3)) + 8|0);
   $8 = HEAP32[$7>>2]|0;
   $9 = ($6|0)!=($8|0);
   $22 = $9;
  } else {
   $22 = 0;
  }
  $10 = HEAP32[$3>>2]|0;
  if (!($22)) {
   break;
  }
  $11 = ((($10)) + 8|0);
  $12 = HEAP32[$11>>2]|0;
  $2 = $12;
  $13 = HEAP32[$3>>2]|0;
  __ZN9rapidjson12CrtAllocator4FreeEPv($13);
  $14 = $2;
  HEAP32[$3>>2] = $14;
 }
 $15 = ($10|0)!=(0|0);
 if (!($15)) {
  STACKTOP = sp;return;
 }
 $16 = HEAP32[$3>>2]|0;
 $17 = ((($3)) + 8|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ($16|0)==($18|0);
 if (!($19)) {
  STACKTOP = sp;return;
 }
 $20 = HEAP32[$3>>2]|0;
 $21 = ((($20)) + 4|0);
 HEAP32[$21>>2] = 0;
 STACKTOP = sp;return;
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E5ParseILj0EEERS6_PKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E5ParseILj0ES2_EERS6_PKNT0_2ChE($4,$5)|0);
 STACKTOP = sp;return ($6|0);
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E5ParseILj0ES2_EERS6_PKNT0_2ChE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = sp;
 $2 = $0;
 $3 = $1;
 $5 = $2;
 $6 = $3;
 __ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEEC2EPKc($4,$6);
 $7 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E11ParseStreamILj0ES2_NS_19GenericStringStreamIS2_EEEERS6_RT1_($5,$4)|0);
 STACKTOP = sp;return ($7|0);
}
function __ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEEC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 HEAP32[$4>>2] = $5;
 $6 = ((($4)) + 4|0);
 $7 = $3;
 HEAP32[$6>>2] = $7;
 STACKTOP = sp;return;
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E11ParseStreamILj0ES2_NS_19GenericStringStreamIS2_EEEERS6_RT1_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $4 = sp + 28|0;
 $5 = sp + 24|0;
 $8 = sp + 8|0;
 $9 = sp;
 $2 = $0;
 $3 = $1;
 $10 = $2;
 $11 = ((($10)) + 32|0);
 $12 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE12HasAllocatorEv($11)|0);
 if ($12) {
  $13 = ((($10)) + 32|0);
  $14 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE12GetAllocatorEv($13)|0);
  $15 = $14;
 } else {
  $15 = 0;
 }
 __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEEC2EPS3_j($4,$15,256);
 __THREW__ = 0;
 invoke_vii(75,($5|0),($10|0));
 $16 = __THREW__; __THREW__ = 0;
 $17 = $16&1;
 if ($17) {
  $35 = ___cxa_find_matching_catch_2()|0;
  $36 = tempRet0;
  $6 = $35;
  $7 = $36;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEED2Ev($4);
  $43 = $6;
  $44 = $7;
  ___resumeException($43|0);
  // unreachable;
 }
 $18 = $3;
 __THREW__ = 0;
 invoke_viiii(76,($8|0),($4|0),($18|0),($10|0));
 $19 = __THREW__; __THREW__ = 0;
 $20 = $19&1;
 do {
  if (!($20)) {
   $21 = ((($10)) + 56|0);
   ;HEAP32[$21>>2]=HEAP32[$8>>2]|0;HEAP32[$21+4>>2]=HEAP32[$8+4>>2]|0;
   $22 = ((($10)) + 56|0);
   __THREW__ = 0;
   invoke_vii(77,($9|0),($22|0));
   $23 = __THREW__; __THREW__ = 0;
   $24 = $23&1;
   if (!($24)) {
    $$field = HEAP32[$9>>2]|0;
    $$index1 = ((($9)) + 4|0);
    $$field2 = HEAP32[$$index1>>2]|0;
    $25 = ($$field|0)!=(0);
    $26 = $$field2 & 1;
    $27 = ($26|0)!=(0);
    $28 = $25 | $27;
    if (!($28)) {
     __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E16ClearStackOnExitD2Ev($5);
     __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEED2Ev($4);
     STACKTOP = sp;return ($10|0);
    }
    $29 = ((($10)) + 32|0);
    __THREW__ = 0;
    $30 = (invoke_ii(78,($29|0))|0);
    $31 = __THREW__; __THREW__ = 0;
    $32 = $31&1;
    if (!($32)) {
     $33 = ($30|0)==(24);
     if (!($33)) {
      __THREW__ = 0;
      invoke_viiii(50,(4882|0),(4920|0),2237,(4959|0));
      $34 = __THREW__; __THREW__ = 0;
      break;
     }
     $39 = ((($10)) + 32|0);
     __THREW__ = 0;
     $40 = (invoke_iii(79,($39|0),1)|0);
     $41 = __THREW__; __THREW__ = 0;
     $42 = $41&1;
     if (!($42)) {
      (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEaSERS6_($10,$40)|0);
      __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E16ClearStackOnExitD2Ev($5);
      __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEED2Ev($4);
      STACKTOP = sp;return ($10|0);
     }
    }
   }
  }
 } while(0);
 $37 = ___cxa_find_matching_catch_2()|0;
 $38 = tempRet0;
 $6 = $37;
 $7 = $38;
 __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E16ClearStackOnExitD2Ev($5);
 __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEED2Ev($4);
 $43 = $6;
 $44 = $7;
 ___resumeException($43|0);
 // unreachable;
 return (0)|0;
}
function __ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE12HasAllocatorEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)!=(0|0);
 STACKTOP = sp;return ($4|0);
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE12GetAllocatorEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)!=(0|0);
 if ($4) {
  $5 = HEAP32[$2>>2]|0;
  STACKTOP = sp;return ($5|0);
 } else {
  ___assert_fail((4971|0),(4982|0),172,(5027|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEEC2EPS3_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $8 = $3;
 $9 = $4;
 $10 = $5;
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEEC2EPS2_j($8,$9,$10);
 $11 = ((($8)) + 24|0);
 __THREW__ = 0;
 invoke_vi(37,($11|0));
 $12 = __THREW__; __THREW__ = 0;
 $13 = $12&1;
 if ($13) {
  $14 = ___cxa_find_matching_catch_2()|0;
  $15 = tempRet0;
  $6 = $14;
  $7 = $15;
  __ZN9rapidjson8internal5StackINS_12CrtAllocatorEED2Ev($8);
  $16 = $6;
  $17 = $7;
  ___resumeException($16|0);
  // unreachable;
 } else {
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E16ClearStackOnExitC2ERS6_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 HEAP32[$4>>2] = $5;
 STACKTOP = sp;return;
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE5ParseILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEENS_11ParseResultERT0_RT1_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $7 = sp + 12|0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $11 = $4;
 $12 = ((($11)) + 24|0);
 __ZN9rapidjson11ParseResult5ClearEv($12);
 __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE16ClearStackOnExitC2ERS4_($7,$11);
 $13 = $5;
 __THREW__ = 0;
 invoke_vii(80,($11|0),($13|0));
 $14 = __THREW__; __THREW__ = 0;
 $15 = $14&1;
 L1: do {
  if (!($15)) {
   __THREW__ = 0;
   $16 = (invoke_ii(81,($11|0))|0);
   $17 = __THREW__; __THREW__ = 0;
   $18 = $17&1;
   if (!($18)) {
    $19 = $16 ^ 1;
    $20 = $19 ^ 1;
    if ($20) {
     $21 = ((($11)) + 24|0);
     ;HEAP32[$0>>2]=HEAP32[$21>>2]|0;HEAP32[$0+4>>2]=HEAP32[$21+4>>2]|0;
     $10 = 1;
     __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE16ClearStackOnExitD2Ev($7);
     STACKTOP = sp;return;
    }
    $26 = $5;
    __THREW__ = 0;
    $27 = (invoke_ii(82,($26|0))|0);
    $28 = __THREW__; __THREW__ = 0;
    $29 = $28&1;
    if (!($29)) {
     $30 = $27 << 24 >> 24;
     $31 = ($30|0)==(0);
     $32 = $31 ^ 1;
     $33 = $32 ^ 1;
     do {
      if ($33) {
       __THREW__ = 0;
       $34 = (invoke_ii(81,($11|0))|0);
       $35 = __THREW__; __THREW__ = 0;
       $36 = $35&1;
       if ($36) {
        break L1;
       }
       if ($34) {
        __THREW__ = 0;
        invoke_viiii(50,(5040|0),(5057|0),570,(5094|0));
        $37 = __THREW__; __THREW__ = 0;
        break L1;
       }
       $38 = $5;
       __THREW__ = 0;
       $39 = (invoke_ii(83,($38|0))|0);
       $40 = __THREW__; __THREW__ = 0;
       $41 = $40&1;
       if ($41) {
        break L1;
       }
       __THREW__ = 0;
       invoke_viii(84,($11|0),1,($39|0));
       $42 = __THREW__; __THREW__ = 0;
       $43 = $42&1;
       if ($43) {
        break L1;
       }
       __THREW__ = 0;
       $44 = (invoke_ii(81,($11|0))|0);
       $45 = __THREW__; __THREW__ = 0;
       $46 = $45&1;
       if ($46) {
        break L1;
       }
       $47 = $44 ^ 1;
       $48 = $47 ^ 1;
       if ($48) {
        $49 = ((($11)) + 24|0);
        ;HEAP32[$0>>2]=HEAP32[$49>>2]|0;HEAP32[$0+4>>2]=HEAP32[$49+4>>2]|0;
        $10 = 1;
        __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE16ClearStackOnExitD2Ev($7);
        STACKTOP = sp;return;
       }
      } else {
       $50 = $5;
       $51 = $6;
       __THREW__ = 0;
       invoke_viii(85,($11|0),($50|0),($51|0));
       $52 = __THREW__; __THREW__ = 0;
       $53 = $52&1;
       if ($53) {
        break L1;
       }
       __THREW__ = 0;
       $54 = (invoke_ii(81,($11|0))|0);
       $55 = __THREW__; __THREW__ = 0;
       $56 = $55&1;
       if ($56) {
        break L1;
       }
       $57 = $54 ^ 1;
       $58 = $57 ^ 1;
       if ($58) {
        $59 = ((($11)) + 24|0);
        ;HEAP32[$0>>2]=HEAP32[$59>>2]|0;HEAP32[$0+4>>2]=HEAP32[$59+4>>2]|0;
        $10 = 1;
        __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE16ClearStackOnExitD2Ev($7);
        STACKTOP = sp;return;
       }
       $60 = $5;
       __THREW__ = 0;
       invoke_vii(80,($11|0),($60|0));
       $61 = __THREW__; __THREW__ = 0;
       $62 = $61&1;
       if ($62) {
        break L1;
       }
       __THREW__ = 0;
       $63 = (invoke_ii(81,($11|0))|0);
       $64 = __THREW__; __THREW__ = 0;
       $65 = $64&1;
       if ($65) {
        break L1;
       }
       $66 = $63 ^ 1;
       $67 = $66 ^ 1;
       if ($67) {
        $68 = ((($11)) + 24|0);
        ;HEAP32[$0>>2]=HEAP32[$68>>2]|0;HEAP32[$0+4>>2]=HEAP32[$68+4>>2]|0;
        $10 = 1;
        __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE16ClearStackOnExitD2Ev($7);
        STACKTOP = sp;return;
       }
       $69 = $5;
       __THREW__ = 0;
       $70 = (invoke_ii(82,($69|0))|0);
       $71 = __THREW__; __THREW__ = 0;
       $72 = $71&1;
       if ($72) {
        break L1;
       }
       $73 = $70 << 24 >> 24;
       $74 = ($73|0)!=(0);
       $75 = $74 ^ 1;
       $76 = $75 ^ 1;
       if ($76) {
        __THREW__ = 0;
        $77 = (invoke_ii(81,($11|0))|0);
        $78 = __THREW__; __THREW__ = 0;
        $79 = $78&1;
        if ($79) {
         break L1;
        }
        if ($77) {
         __THREW__ = 0;
         invoke_viiii(50,(5040|0),(5057|0),582,(5094|0));
         $80 = __THREW__; __THREW__ = 0;
         break L1;
        }
        $81 = $5;
        __THREW__ = 0;
        $82 = (invoke_ii(83,($81|0))|0);
        $83 = __THREW__; __THREW__ = 0;
        $84 = $83&1;
        if ($84) {
         break L1;
        }
        __THREW__ = 0;
        invoke_viii(84,($11|0),2,($82|0));
        $85 = __THREW__; __THREW__ = 0;
        $86 = $85&1;
        if ($86) {
         break L1;
        }
        __THREW__ = 0;
        $87 = (invoke_ii(81,($11|0))|0);
        $88 = __THREW__; __THREW__ = 0;
        $89 = $88&1;
        if ($89) {
         break L1;
        }
        $90 = $87 ^ 1;
        $91 = $90 ^ 1;
        if (!($91)) {
         break;
        }
        $92 = ((($11)) + 24|0);
        ;HEAP32[$0>>2]=HEAP32[$92>>2]|0;HEAP32[$0+4>>2]=HEAP32[$92+4>>2]|0;
        $10 = 1;
        __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE16ClearStackOnExitD2Ev($7);
        STACKTOP = sp;return;
       }
      }
     } while(0);
     $93 = ((($11)) + 24|0);
     ;HEAP32[$0>>2]=HEAP32[$93>>2]|0;HEAP32[$0+4>>2]=HEAP32[$93+4>>2]|0;
     $10 = 1;
     __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE16ClearStackOnExitD2Ev($7);
     STACKTOP = sp;return;
    }
   }
  }
 } while(0);
 $22 = ___cxa_find_matching_catch_2()|0;
 $23 = tempRet0;
 $8 = $22;
 $9 = $23;
 __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE16ClearStackOnExitD2Ev($7);
 $24 = $8;
 $25 = $9;
 ___resumeException($24|0);
 // unreachable;
}
function __ZNK9rapidjson11ParseResultcvMS0_KFbvEEv($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$field = 0, $$field11 = 0, $$index = 0, $$index10 = 0, $$index14 = 0, $$index4 = 0, $$index7 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp + 8|0;
 $3 = $1;
 $4 = $3;
 $5 = (__ZNK9rapidjson11ParseResult7IsErrorEv($4)|0);
 $6 = $5 ^ 1;
 $$index = $6 ? (86) : 0;
 $$index4 = $6 ? 0 : 0;
 HEAP32[$2>>2] = $$index;
 $$index7 = ((($2)) + 4|0);
 HEAP32[$$index7>>2] = $$index4;
 $$field = HEAP32[$2>>2]|0;
 $$index10 = ((($2)) + 4|0);
 $$field11 = HEAP32[$$index10>>2]|0;
 HEAP32[$0>>2] = $$field;
 $$index14 = ((($0)) + 4|0);
 HEAP32[$$index14>>2] = $$field11;
 STACKTOP = sp;return;
}
function __ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE7GetSizeEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 12|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($2)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $4;
 $8 = $6;
 $9 = (($7) - ($8))|0;
 STACKTOP = sp;return ($9|0);
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEaSERS6_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = ($4|0)!=($5|0);
 if ($6) {
  __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($4);
  $10 = $3;
  __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9RawAssignERS6_($4,$10);
  STACKTOP = sp;return ($4|0);
 } else {
  __THREW__ = 0;
  invoke_viiii(50,(5870|0),(4920|0),810,(5883|0));
  $7 = __THREW__; __THREW__ = 0;
  $8 = ___cxa_find_matching_catch_3(0|0)|0;
  $9 = tempRet0;
  ___clang_call_terminate($8);
  // unreachable;
 }
 return (0)|0;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3PopINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE7GetSizeEv($4)|0);
 $6 = $3;
 $7 = ($6*24)|0;
 $8 = ($5>>>0)>=($7>>>0);
 if ($8) {
  $9 = $3;
  $10 = ($9*24)|0;
  $11 = ((($4)) + 12|0);
  $12 = HEAP32[$11>>2]|0;
  $13 = (0 - ($10))|0;
  $14 = (($12) + ($13)|0);
  HEAP32[$11>>2] = $14;
  $15 = ((($4)) + 12|0);
  $16 = HEAP32[$15>>2]|0;
  STACKTOP = sp;return ($16|0);
 } else {
  ___assert_fail((5630|0),(4982|0),138,(5661|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E16ClearStackOnExitD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 __THREW__ = 0;
 invoke_vi(87,($3|0));
 $4 = __THREW__; __THREW__ = 0;
 $5 = $4&1;
 if ($5) {
  $6 = ___cxa_find_matching_catch_3(0|0)|0;
  $7 = tempRet0;
  ___clang_call_terminate($6);
  // unreachable;
 } else {
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEED2Ev($2);
 STACKTOP = sp;return;
}
function __ZN9rapidjson11ParseResult5ClearEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZN9rapidjson11ParseResult3SetENS_14ParseErrorCodeEj($2,0,0);
 STACKTOP = sp;return;
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE16ClearStackOnExitC2ERS4_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 HEAP32[$4>>2] = $5;
 STACKTOP = sp;return;
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE25SkipWhitespaceAndCommentsILj0ENS_19GenericStringStreamIS2_EEEEvRT0_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 __ZN9rapidjson14SkipWhitespaceINS_19GenericStringStreamINS_4UTF8IcEEEEEEvRT_($4);
 STACKTOP = sp;return;
}
function __ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 24|0);
 $4 = (__ZNK9rapidjson11ParseResult7IsErrorEv($3)|0);
 STACKTOP = sp;return ($4|0);
}
function __ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4PeekEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = HEAP8[$3>>0]|0;
 STACKTOP = sp;return ($4|0);
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = ((($6)) + 24|0);
 $8 = $4;
 $9 = $5;
 __ZN9rapidjson11ParseResult3SetENS_14ParseErrorCodeEj($7,$8,$9);
 STACKTOP = sp;return;
}
function __ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = ((($2)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $3;
 $7 = $5;
 $8 = (($6) - ($7))|0;
 STACKTOP = sp;return ($8|0);
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE10ParseValueILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 $8 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4PeekEv($7)|0);
 $9 = $8 << 24 >> 24;
 switch ($9|0) {
 case 110:  {
  $10 = $4;
  $11 = $5;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE9ParseNullILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_($6,$10,$11);
  STACKTOP = sp;return;
  break;
 }
 case 116:  {
  $12 = $4;
  $13 = $5;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE9ParseTrueILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_($6,$12,$13);
  STACKTOP = sp;return;
  break;
 }
 case 102:  {
  $14 = $4;
  $15 = $5;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE10ParseFalseILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_($6,$14,$15);
  STACKTOP = sp;return;
  break;
 }
 case 34:  {
  $16 = $4;
  $17 = $5;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11ParseStringILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_b($6,$16,$17,0);
  STACKTOP = sp;return;
  break;
 }
 case 123:  {
  $18 = $4;
  $19 = $5;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11ParseObjectILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_($6,$18,$19);
  STACKTOP = sp;return;
  break;
 }
 case 91:  {
  $20 = $4;
  $21 = $5;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE10ParseArrayILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_($6,$20,$21);
  STACKTOP = sp;return;
  break;
 }
 default: {
  $22 = $4;
  $23 = $5;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11ParseNumberILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_($6,$22,$23);
  STACKTOP = sp;return;
 }
 }
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE16ClearStackOnExitD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 __THREW__ = 0;
 invoke_vi(88,($3|0));
 $4 = __THREW__; __THREW__ = 0;
 $5 = $4&1;
 if ($5) {
  $6 = ___cxa_find_matching_catch_3(0|0)|0;
  $7 = tempRet0;
  ___clang_call_terminate($6);
  // unreachable;
 } else {
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson11ParseResult3SetENS_14ParseErrorCodeEj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 HEAP32[$6>>2] = $7;
 $8 = $5;
 $9 = ((($6)) + 4|0);
 HEAP32[$9>>2] = $8;
 STACKTOP = sp;return;
}
function __ZN9rapidjson14SkipWhitespaceINS_19GenericStringStreamINS_4UTF8IcEEEEEEvRT_($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $2 = sp + 12|0;
 $1 = $0;
 $7 = $1;
 __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EEC2ERS5_($2,$7);
 $3 = $2;
 while(1) {
  $8 = $3;
  __THREW__ = 0;
  $9 = (invoke_ii(82,($8|0))|0);
  $10 = __THREW__; __THREW__ = 0;
  $11 = $10&1;
  if ($11) {
   label = 8;
   break;
  }
  $4 = $9;
  $12 = $9 << 24 >> 24;
  $13 = ($12|0)==(32);
  if (!($13)) {
   $14 = $4;
   $15 = $14 << 24 >> 24;
   $16 = ($15|0)==(10);
   if (!($16)) {
    $17 = $4;
    $18 = $17 << 24 >> 24;
    $19 = ($18|0)==(13);
    if (!($19)) {
     $20 = $4;
     $21 = $20 << 24 >> 24;
     $22 = ($21|0)==(9);
     if (!($22)) {
      label = 9;
      break;
     }
    }
   }
  }
  $23 = $3;
  __THREW__ = 0;
  (invoke_ii(89,($23|0))|0);
  $24 = __THREW__; __THREW__ = 0;
  $25 = $24&1;
  if ($25) {
   label = 8;
   break;
  }
 }
 if ((label|0) == 8) {
  $26 = ___cxa_find_matching_catch_2()|0;
  $27 = tempRet0;
  $5 = $26;
  $6 = $27;
  __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EED2Ev($2);
  $28 = $5;
  $29 = $6;
  ___resumeException($28|0);
  // unreachable;
 }
 else if ((label|0) == 9) {
  __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EED2Ev($2);
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EEC2ERS5_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 ;HEAP32[$4>>2]=HEAP32[$5>>2]|0;HEAP32[$4+4>>2]=HEAP32[$5+4>>2]|0;
 $6 = ((($4)) + 8|0);
 $7 = $3;
 HEAP32[$6>>2] = $7;
 STACKTOP = sp;return;
}
function __ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = ((($3)) + 1|0);
 HEAP32[$2>>2] = $4;
 $5 = HEAP8[$3>>0]|0;
 STACKTOP = sp;return ($5|0);
}
function __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 ;HEAP32[$4>>2]=HEAP32[$2>>2]|0;HEAP32[$4+4>>2]=HEAP32[$2+4>>2]|0;
 STACKTOP = sp;return;
}
function __ZNK9rapidjson11ParseResult7IsErrorEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)!=(0);
 STACKTOP = sp;return ($4|0);
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE9ParseNullILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 $8 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4PeekEv($7)|0);
 $9 = $8 << 24 >> 24;
 $10 = ($9|0)==(110);
 if (!($10)) {
  ___assert_fail((5100|0),(5057|0),856,(5117|0));
  // unreachable;
 }
 $11 = $4;
 (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($11)|0);
 $12 = $4;
 $13 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($12,117)|0);
 if ($13) {
  $14 = $4;
  $15 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($14,108)|0);
  if ($15) {
   $16 = $4;
   $17 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($16,108)|0);
   $19 = $17;
  } else {
   $19 = 0;
  }
 } else {
  $19 = 0;
 }
 $18 = $19 ^ 1;
 $20 = $18 ^ 1;
 if (!($20)) {
  $29 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($6)|0);
  if ($29) {
   ___assert_fail((5040|0),(5057|0),864,(5117|0));
   // unreachable;
  }
  $30 = $4;
  $31 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($30)|0);
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($6,3,$31);
  (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($6)|0);
  STACKTOP = sp;return;
 }
 $21 = $5;
 $22 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E4NullEv($21)|0);
 $23 = $22 ^ 1;
 $24 = $23 ^ 1;
 $25 = $24 ^ 1;
 if (!($25)) {
  STACKTOP = sp;return;
 }
 $26 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($6)|0);
 if ($26) {
  ___assert_fail((5040|0),(5057|0),861,(5117|0));
  // unreachable;
 } else {
  $27 = $4;
  $28 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($27)|0);
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($6,16,$28);
  (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($6)|0);
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE9ParseTrueILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 $8 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4PeekEv($7)|0);
 $9 = $8 << 24 >> 24;
 $10 = ($9|0)==(116);
 if (!($10)) {
  ___assert_fail((5191|0),(5057|0),869,(5208|0));
  // unreachable;
 }
 $11 = $4;
 (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($11)|0);
 $12 = $4;
 $13 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($12,114)|0);
 if ($13) {
  $14 = $4;
  $15 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($14,117)|0);
  if ($15) {
   $16 = $4;
   $17 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($16,101)|0);
   $19 = $17;
  } else {
   $19 = 0;
  }
 } else {
  $19 = 0;
 }
 $18 = $19 ^ 1;
 $20 = $18 ^ 1;
 if (!($20)) {
  $29 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($6)|0);
  if ($29) {
   ___assert_fail((5040|0),(5057|0),877,(5208|0));
   // unreachable;
  }
  $30 = $4;
  $31 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($30)|0);
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($6,3,$31);
  (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($6)|0);
  STACKTOP = sp;return;
 }
 $21 = $5;
 $22 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E4BoolEb($21,1)|0);
 $23 = $22 ^ 1;
 $24 = $23 ^ 1;
 $25 = $24 ^ 1;
 if (!($25)) {
  STACKTOP = sp;return;
 }
 $26 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($6)|0);
 if ($26) {
  ___assert_fail((5040|0),(5057|0),874,(5208|0));
  // unreachable;
 } else {
  $27 = $4;
  $28 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($27)|0);
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($6,16,$28);
  (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($6)|0);
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE10ParseFalseILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 $8 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4PeekEv($7)|0);
 $9 = $8 << 24 >> 24;
 $10 = ($9|0)==(102);
 if (!($10)) {
  ___assert_fail((5218|0),(5057|0),882,(5235|0));
  // unreachable;
 }
 $11 = $4;
 (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($11)|0);
 $12 = $4;
 $13 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($12,97)|0);
 if ($13) {
  $14 = $4;
  $15 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($14,108)|0);
  if ($15) {
   $16 = $4;
   $17 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($16,115)|0);
   if ($17) {
    $18 = $4;
    $19 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($18,101)|0);
    $21 = $19;
   } else {
    $21 = 0;
   }
  } else {
   $21 = 0;
  }
 } else {
  $21 = 0;
 }
 $20 = $21 ^ 1;
 $22 = $20 ^ 1;
 if (!($22)) {
  $31 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($6)|0);
  if ($31) {
   ___assert_fail((5040|0),(5057|0),890,(5235|0));
   // unreachable;
  }
  $32 = $4;
  $33 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($32)|0);
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($6,3,$33);
  (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($6)|0);
  STACKTOP = sp;return;
 }
 $23 = $5;
 $24 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E4BoolEb($23,0)|0);
 $25 = $24 ^ 1;
 $26 = $25 ^ 1;
 $27 = $26 ^ 1;
 if (!($27)) {
  STACKTOP = sp;return;
 }
 $28 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($6)|0);
 if ($28) {
  ___assert_fail((5040|0),(5057|0),887,(5235|0));
  // unreachable;
 } else {
  $29 = $4;
  $30 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($29)|0);
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($6,16,$30);
  (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($6)|0);
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11ParseStringILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_b($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $8 = sp + 36|0;
 $13 = sp + 16|0;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $17 = $3&1;
 $7 = $17;
 $18 = $4;
 $19 = $5;
 __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EEC2ERS5_($8,$19);
 $9 = $8;
 $20 = $9;
 __THREW__ = 0;
 $21 = (invoke_ii(82,($20|0))|0);
 $22 = __THREW__; __THREW__ = 0;
 $23 = $22&1;
 do {
  if (!($23)) {
   $24 = $21 << 24 >> 24;
   $25 = ($24|0)==(34);
   if (!($25)) {
    __THREW__ = 0;
    invoke_viiii(50,(5246|0),(5057|0),962,(5263|0));
    $26 = __THREW__; __THREW__ = 0;
    break;
   }
   $31 = $9;
   __THREW__ = 0;
   (invoke_ii(89,($31|0))|0);
   $32 = __THREW__; __THREW__ = 0;
   $33 = $32&1;
   if (!($33)) {
    $12 = 0;
    __THREW__ = 0;
    invoke_vii(90,($13|0),($18|0));
    $34 = __THREW__; __THREW__ = 0;
    $35 = $34&1;
    if (!($35)) {
     $36 = $9;
     __THREW__ = 0;
     invoke_viii(91,($18|0),($36|0),($13|0));
     $37 = __THREW__; __THREW__ = 0;
     $38 = $37&1;
     if (!($38)) {
      __THREW__ = 0;
      $39 = (invoke_ii(81,($18|0))|0);
      $40 = __THREW__; __THREW__ = 0;
      $41 = $40&1;
      if (!($41)) {
       $42 = $39 ^ 1;
       $43 = $42 ^ 1;
       if ($43) {
        $14 = 1;
        __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EED2Ev($8);
        STACKTOP = sp;return;
       }
       __THREW__ = 0;
       $44 = (invoke_ii(92,($13|0))|0);
       $45 = __THREW__; __THREW__ = 0;
       $46 = $45&1;
       if (!($46)) {
        $47 = (($44) - 1)|0;
        $15 = $47;
        __THREW__ = 0;
        $48 = (invoke_ii(93,($13|0))|0);
        $49 = __THREW__; __THREW__ = 0;
        $50 = $49&1;
        if (!($50)) {
         $16 = $48;
         $51 = $7;
         $52 = $51&1;
         $53 = $6;
         $54 = $16;
         $55 = $15;
         if ($52) {
          __THREW__ = 0;
          $56 = (invoke_iiiii(94,($53|0),($54|0),($55|0),1)|0);
          $57 = __THREW__; __THREW__ = 0;
          $58 = $57&1;
          if ($58) {
           break;
          } else {
           $63 = $56;
          }
         } else {
          __THREW__ = 0;
          $59 = (invoke_iiiii(95,($53|0),($54|0),($55|0),1)|0);
          $60 = __THREW__; __THREW__ = 0;
          $61 = $60&1;
          if ($61) {
           break;
          } else {
           $63 = $59;
          }
         }
         $62 = $63&1;
         $12 = $62;
         $64 = $12;
         $65 = $64&1;
         $66 = $65 ^ 1;
         $67 = $66 ^ 1;
         $68 = $67 ^ 1;
         if ($68) {
          __THREW__ = 0;
          $69 = (invoke_ii(81,($18|0))|0);
          $70 = __THREW__; __THREW__ = 0;
          $71 = $70&1;
          if ($71) {
           break;
          }
          if ($69) {
           __THREW__ = 0;
           invoke_viiii(50,(5040|0),(5057|0),984,(5263|0));
           $72 = __THREW__; __THREW__ = 0;
           break;
          }
          $73 = $9;
          __THREW__ = 0;
          $74 = (invoke_ii(83,($73|0))|0);
          $75 = __THREW__; __THREW__ = 0;
          $76 = $75&1;
          if ($76) {
           break;
          }
          __THREW__ = 0;
          invoke_viii(84,($18|0),16,($74|0));
          $77 = __THREW__; __THREW__ = 0;
          $78 = $77&1;
          if ($78) {
           break;
          }
          __THREW__ = 0;
          $79 = (invoke_ii(81,($18|0))|0);
          $80 = __THREW__; __THREW__ = 0;
          $81 = $80&1;
          if ($81) {
           break;
          }
          $82 = $79 ^ 1;
          $83 = $82 ^ 1;
          if ($83) {
           $14 = 1;
           __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EED2Ev($8);
           STACKTOP = sp;return;
          }
         }
         $14 = 0;
         __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EED2Ev($8);
         STACKTOP = sp;return;
        }
       }
      }
     }
    }
   }
  }
 } while(0);
 $27 = ___cxa_find_matching_catch_2()|0;
 $28 = tempRet0;
 $10 = $27;
 $11 = $28;
 __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EED2Ev($8);
 $29 = $10;
 $30 = $11;
 ___resumeException($29|0);
 // unreachable;
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11ParseObjectILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0;
 var $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0;
 var $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0;
 var $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0;
 var $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = $3;
 $8 = $4;
 $9 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4PeekEv($8)|0);
 $10 = $9 << 24 >> 24;
 $11 = ($10|0)==(123);
 if (!($11)) {
  ___assert_fail((5704|0),(5057|0),740,(5721|0));
  // unreachable;
 }
 $12 = $4;
 (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($12)|0);
 $13 = $5;
 $14 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E11StartObjectEv($13)|0);
 $15 = $14 ^ 1;
 $16 = $15 ^ 1;
 $17 = $16 ^ 1;
 if ($17) {
  $18 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  if ($18) {
   ___assert_fail((5040|0),(5057|0),744,(5721|0));
   // unreachable;
  }
  $19 = $4;
  $20 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($19)|0);
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($7,16,$20);
  $21 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  $22 = $21 ^ 1;
  $23 = $22 ^ 1;
  if ($23) {
   STACKTOP = sp;return;
  }
 }
 $24 = $4;
 __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE25SkipWhitespaceAndCommentsILj0ENS_19GenericStringStreamIS2_EEEEvRT0_($7,$24);
 $25 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
 $26 = $25 ^ 1;
 $27 = $26 ^ 1;
 if ($27) {
  STACKTOP = sp;return;
 }
 $28 = $4;
 $29 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($28,125)|0);
 if ($29) {
  $30 = $5;
  $31 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E9EndObjectEj($30,0)|0);
  $32 = $31 ^ 1;
  $33 = $32 ^ 1;
  $34 = $33 ^ 1;
  if (!($34)) {
   STACKTOP = sp;return;
  }
  $35 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  if ($35) {
   ___assert_fail((5040|0),(5057|0),751,(5721|0));
   // unreachable;
  } else {
   $36 = $4;
   $37 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($36)|0);
   __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($7,16,$37);
   (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
   STACKTOP = sp;return;
  }
 }
 $6 = 0;
 L23: while(1) {
  $38 = $4;
  $39 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4PeekEv($38)|0);
  $40 = $39 << 24 >> 24;
  $41 = ($40|0)!=(34);
  $42 = $41 ^ 1;
  $43 = $42 ^ 1;
  if ($43) {
   $44 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
   if ($44) {
    label = 16;
    break;
   }
   $45 = $4;
   $46 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($45)|0);
   __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($7,4,$46);
   $47 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
   $48 = $47 ^ 1;
   $49 = $48 ^ 1;
   if ($49) {
    label = 36;
    break;
   }
  }
  $50 = $4;
  $51 = $5;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11ParseStringILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_b($7,$50,$51,1);
  $52 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  $53 = $52 ^ 1;
  $54 = $53 ^ 1;
  if ($54) {
   label = 36;
   break;
  }
  $55 = $4;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE25SkipWhitespaceAndCommentsILj0ENS_19GenericStringStreamIS2_EEEEvRT0_($7,$55);
  $56 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  $57 = $56 ^ 1;
  $58 = $57 ^ 1;
  if ($58) {
   label = 36;
   break;
  }
  $59 = $4;
  $60 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($59,58)|0);
  $61 = $60 ^ 1;
  $62 = $61 ^ 1;
  $63 = $62 ^ 1;
  if ($63) {
   $64 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
   if ($64) {
    label = 22;
    break;
   }
   $65 = $4;
   $66 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($65)|0);
   __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($7,5,$66);
   $67 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
   $68 = $67 ^ 1;
   $69 = $68 ^ 1;
   if ($69) {
    label = 36;
    break;
   }
  }
  $70 = $4;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE25SkipWhitespaceAndCommentsILj0ENS_19GenericStringStreamIS2_EEEEvRT0_($7,$70);
  $71 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  $72 = $71 ^ 1;
  $73 = $72 ^ 1;
  if ($73) {
   label = 36;
   break;
  }
  $74 = $4;
  $75 = $5;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE10ParseValueILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_($7,$74,$75);
  $76 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  $77 = $76 ^ 1;
  $78 = $77 ^ 1;
  if ($78) {
   label = 36;
   break;
  }
  $79 = $4;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE25SkipWhitespaceAndCommentsILj0ENS_19GenericStringStreamIS2_EEEEvRT0_($7,$79);
  $80 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  $81 = $80 ^ 1;
  $82 = $81 ^ 1;
  if ($82) {
   label = 36;
   break;
  }
  $83 = $6;
  $84 = (($83) + 1)|0;
  $6 = $84;
  $85 = $4;
  $86 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4PeekEv($85)|0);
  $87 = $86 << 24 >> 24;
  switch ($87|0) {
  case 125:  {
   label = 29;
   break L23;
   break;
  }
  case 44:  {
   $88 = $4;
   (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($88)|0);
   $89 = $4;
   __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE25SkipWhitespaceAndCommentsILj0ENS_19GenericStringStreamIS2_EEEEvRT0_($7,$89);
   $90 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
   $91 = $90 ^ 1;
   $92 = $91 ^ 1;
   if ($92) {
    label = 36;
    break L23;
   } else {
    continue L23;
   }
   break;
  }
  default: {
  }
  }
  $103 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  if ($103) {
   label = 34;
   break;
  }
  $104 = $4;
  $105 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($104)|0);
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($7,6,$105);
  $106 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  $107 = $106 ^ 1;
  $108 = $107 ^ 1;
  if ($108) {
   label = 36;
   break;
  }
 }
 if ((label|0) == 16) {
  ___assert_fail((5040|0),(5057|0),757,(5721|0));
  // unreachable;
 }
 else if ((label|0) == 22) {
  ___assert_fail((5040|0),(5057|0),766,(5721|0));
  // unreachable;
 }
 else if ((label|0) == 29) {
  $93 = $4;
  (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($93)|0);
  $94 = $5;
  $95 = $6;
  $96 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E9EndObjectEj($94,$95)|0);
  $97 = $96 ^ 1;
  $98 = $97 ^ 1;
  $99 = $98 ^ 1;
  if (!($99)) {
   STACKTOP = sp;return;
  }
  $100 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  if ($100) {
   ___assert_fail((5040|0),(5057|0),788,(5721|0));
   // unreachable;
  }
  $101 = $4;
  $102 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($101)|0);
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($7,16,$102);
  (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  STACKTOP = sp;return;
 }
 else if ((label|0) == 34) {
  ___assert_fail((5040|0),(5057|0),791,(5721|0));
  // unreachable;
 }
 else if ((label|0) == 36) {
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE10ParseArrayILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = $3;
 $8 = $4;
 $9 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4PeekEv($8)|0);
 $10 = $9 << 24 >> 24;
 $11 = ($10|0)==(91);
 if (!($11)) {
  ___assert_fail((5760|0),(5057|0),808,(5777|0));
  // unreachable;
 }
 $12 = $4;
 (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($12)|0);
 $13 = $5;
 $14 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E10StartArrayEv($13)|0);
 $15 = $14 ^ 1;
 $16 = $15 ^ 1;
 $17 = $16 ^ 1;
 if ($17) {
  $18 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  if ($18) {
   ___assert_fail((5040|0),(5057|0),812,(5777|0));
   // unreachable;
  }
  $19 = $4;
  $20 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($19)|0);
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($7,16,$20);
  $21 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  $22 = $21 ^ 1;
  $23 = $22 ^ 1;
  if ($23) {
   STACKTOP = sp;return;
  }
 }
 $24 = $4;
 __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE25SkipWhitespaceAndCommentsILj0ENS_19GenericStringStreamIS2_EEEEvRT0_($7,$24);
 $25 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
 $26 = $25 ^ 1;
 $27 = $26 ^ 1;
 if ($27) {
  STACKTOP = sp;return;
 }
 $28 = $4;
 $29 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($28,93)|0);
 if ($29) {
  $30 = $5;
  $31 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E8EndArrayEj($30,0)|0);
  $32 = $31 ^ 1;
  $33 = $32 ^ 1;
  $34 = $33 ^ 1;
  if (!($34)) {
   STACKTOP = sp;return;
  }
  $35 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  if ($35) {
   ___assert_fail((5040|0),(5057|0),819,(5777|0));
   // unreachable;
  } else {
   $36 = $4;
   $37 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($36)|0);
   __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($7,16,$37);
   (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
   STACKTOP = sp;return;
  }
 }
 $6 = 0;
 while(1) {
  $38 = $4;
  $39 = $5;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE10ParseValueILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_($7,$38,$39);
  $40 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  $41 = $40 ^ 1;
  $42 = $41 ^ 1;
  if ($42) {
   label = 26;
   break;
  }
  $43 = $6;
  $44 = (($43) + 1)|0;
  $6 = $44;
  $45 = $4;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE25SkipWhitespaceAndCommentsILj0ENS_19GenericStringStreamIS2_EEEEvRT0_($7,$45);
  $46 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  $47 = $46 ^ 1;
  $48 = $47 ^ 1;
  if ($48) {
   label = 26;
   break;
  }
  $49 = $4;
  $50 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($49,44)|0);
  $51 = $4;
  if ($50) {
   __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE25SkipWhitespaceAndCommentsILj0ENS_19GenericStringStreamIS2_EEEEvRT0_($7,$51);
   $52 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
   $53 = $52 ^ 1;
   $54 = $53 ^ 1;
   if ($54) {
    label = 26;
    break;
   } else {
    continue;
   }
  }
  $55 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($51,93)|0);
  if ($55) {
   label = 19;
   break;
  }
  $65 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  if ($65) {
   label = 24;
   break;
  }
  $66 = $4;
  $67 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($66)|0);
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($7,7,$67);
  $68 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  $69 = $68 ^ 1;
  $70 = $69 ^ 1;
  if ($70) {
   label = 26;
   break;
  }
 }
 if ((label|0) == 19) {
  $56 = $5;
  $57 = $6;
  $58 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E8EndArrayEj($56,$57)|0);
  $59 = $58 ^ 1;
  $60 = $59 ^ 1;
  $61 = $60 ^ 1;
  if (!($61)) {
   STACKTOP = sp;return;
  }
  $62 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  if ($62) {
   ___assert_fail((5040|0),(5057|0),837,(5777|0));
   // unreachable;
  }
  $63 = $4;
  $64 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($63)|0);
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($7,16,$64);
  (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($7)|0);
  STACKTOP = sp;return;
 }
 else if ((label|0) == 24) {
  ___assert_fail((5040|0),(5057|0),841,(5777|0));
  // unreachable;
 }
 else if ((label|0) == 26) {
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11ParseNumberILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$not = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0.0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0;
 var $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0;
 var $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0;
 var $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0;
 var $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0;
 var $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0;
 var $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0;
 var $226 = 0, $227 = 0, $228 = 0.0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0;
 var $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0;
 var $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0;
 var $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0;
 var $299 = 0.0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0;
 var $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0;
 var $334 = 0, $335 = 0, $336 = 0.0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0;
 var $352 = 0.0, $353 = 0.0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0.0, $36 = 0, $360 = 0.0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0;
 var $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0;
 var $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0;
 var $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0;
 var $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0;
 var $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0;
 var $460 = 0.0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0.0, $477 = 0.0, $478 = 0;
 var $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0.0, $484 = 0.0, $485 = 0, $486 = 0, $487 = 0.0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0;
 var $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0;
 var $514 = 0, $515 = 0, $516 = 0, $517 = 0.0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0;
 var $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0;
 var $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0;
 var $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0;
 var $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0;
 var $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0;
 var $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0;
 var $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0.0, $652 = 0, $653 = 0.0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0;
 var $659 = 0.0, $66 = 0, $660 = 0.0, $661 = 0.0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0.0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0;
 var $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0;
 var $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0;
 var $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0;
 var $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0;
 var $97 = 0, $98 = 0, $99 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 112|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(112|0);
 $6 = sp + 72|0;
 $7 = sp + 68|0;
 $15 = sp;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $29 = $3;
 $30 = $4;
 __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EEC2ERS5_($6,$30);
 __THREW__ = 0;
 invoke_viii(96,($7|0),($29|0),($6|0));
 $31 = __THREW__; __THREW__ = 0;
 $32 = $31&1;
 L1: do {
  if (!($32)) {
   __THREW__ = 0;
   $33 = (invoke_ii(97,($7|0))|0);
   $34 = __THREW__; __THREW__ = 0;
   $35 = $34&1;
   if (!($35)) {
    $10 = $33;
    $11 = 0.0;
    $12 = 0;
    __THREW__ = 0;
    $36 = (invoke_iii(98,($7|0),45)|0);
    $37 = __THREW__; __THREW__ = 0;
    $38 = $37&1;
    if (!($38)) {
     $39 = $36&1;
     $13 = $39;
     $14 = 0;
     $40 = $15;
     $41 = $40;
     HEAP32[$41>>2] = 0;
     $42 = (($40) + 4)|0;
     $43 = $42;
     HEAP32[$43>>2] = 0;
     $16 = 0;
     $17 = 0;
     __THREW__ = 0;
     $44 = (invoke_ii(99,($7|0))|0);
     $45 = __THREW__; __THREW__ = 0;
     $46 = $45&1;
     if (!($46)) {
      $47 = $44 << 24 >> 24;
      $48 = ($47|0)==(48);
      $49 = $48 ^ 1;
      $50 = $49 ^ 1;
      L6: do {
       if ($50) {
        $14 = 0;
        __THREW__ = 0;
        (invoke_ii(100,($7|0))|0);
        $51 = __THREW__; __THREW__ = 0;
        $52 = $51&1;
        if ($52) {
         break L1;
        }
       } else {
        __THREW__ = 0;
        $57 = (invoke_ii(99,($7|0))|0);
        $58 = __THREW__; __THREW__ = 0;
        $59 = $58&1;
        if ($59) {
         break L1;
        }
        $60 = $57 << 24 >> 24;
        $61 = ($60|0)>=(49);
        if ($61) {
         __THREW__ = 0;
         $62 = (invoke_ii(99,($7|0))|0);
         $63 = __THREW__; __THREW__ = 0;
         $64 = $63&1;
         if ($64) {
          break L1;
         }
         $65 = $62 << 24 >> 24;
         $66 = ($65|0)<=(57);
         $68 = $66;
        } else {
         $68 = 0;
        }
        $67 = $68 ^ 1;
        $69 = $67 ^ 1;
        if (!($69)) {
         __THREW__ = 0;
         $161 = (invoke_ii(81,($29|0))|0);
         $162 = __THREW__; __THREW__ = 0;
         $163 = $162&1;
         if ($163) {
          break L1;
         }
         if ($161) {
          __THREW__ = 0;
          invoke_viiii(50,(5040|0),(5057|0),1533,(5788|0));
          $164 = __THREW__; __THREW__ = 0;
          break L1;
         }
         __THREW__ = 0;
         $165 = (invoke_ii(97,($7|0))|0);
         $166 = __THREW__; __THREW__ = 0;
         $167 = $166&1;
         if ($167) {
          break L1;
         }
         __THREW__ = 0;
         invoke_viii(84,($29|0),3,($165|0));
         $168 = __THREW__; __THREW__ = 0;
         $169 = $168&1;
         if ($169) {
          break L1;
         }
         __THREW__ = 0;
         $170 = (invoke_ii(81,($29|0))|0);
         $171 = __THREW__; __THREW__ = 0;
         $172 = $171&1;
         if ($172) {
          break L1;
         }
         $173 = $170 ^ 1;
         $174 = $173 ^ 1;
         if (!($174)) {
          break;
         }
         $18 = 1;
         __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EED2Ev($6);
         STACKTOP = sp;return;
        }
        __THREW__ = 0;
        $70 = (invoke_ii(100,($7|0))|0);
        $71 = __THREW__; __THREW__ = 0;
        $72 = $71&1;
        if ($72) {
         break L1;
        }
        $73 = $70 << 24 >> 24;
        $74 = (($73) - 48)|0;
        $14 = $74;
        $75 = $13;
        $76 = $75&1;
        if ($76) {
         while(1) {
          __THREW__ = 0;
          $77 = (invoke_ii(99,($7|0))|0);
          $78 = __THREW__; __THREW__ = 0;
          $79 = $78&1;
          if ($79) {
           break L1;
          }
          $80 = $77 << 24 >> 24;
          $81 = ($80|0)>=(48);
          if ($81) {
           __THREW__ = 0;
           $82 = (invoke_ii(99,($7|0))|0);
           $83 = __THREW__; __THREW__ = 0;
           $84 = $83&1;
           if ($84) {
            break L1;
           }
           $85 = $82 << 24 >> 24;
           $86 = ($85|0)<=(57);
           $88 = $86;
          } else {
           $88 = 0;
          }
          $87 = $88 ^ 1;
          $89 = $87 ^ 1;
          if (!($89)) {
           break L6;
          }
          $90 = $14;
          $91 = ($90>>>0)>=(214748364);
          $92 = $91 ^ 1;
          $93 = $92 ^ 1;
          if ($93) {
           $94 = $14;
           $95 = ($94|0)!=(214748364);
           if ($95) {
            $102 = 1;
           } else {
            __THREW__ = 0;
            $96 = (invoke_ii(99,($7|0))|0);
            $97 = __THREW__; __THREW__ = 0;
            $98 = $97&1;
            if ($98) {
             break L1;
            }
            $99 = $96 << 24 >> 24;
            $100 = ($99|0)>(56);
            $102 = $100;
           }
           $101 = $102 ^ 1;
           $103 = $101 ^ 1;
           if ($103) {
            break;
           }
          }
          $109 = $14;
          $110 = ($109*10)|0;
          __THREW__ = 0;
          $111 = (invoke_ii(100,($7|0))|0);
          $112 = __THREW__; __THREW__ = 0;
          $113 = $112&1;
          if ($113) {
           break L1;
          }
          $114 = $111 << 24 >> 24;
          $115 = (($114) - 48)|0;
          $116 = (($110) + ($115))|0;
          $14 = $116;
          $117 = $17;
          $118 = (($117) + 1)|0;
          $17 = $118;
         }
         $104 = $14;
         $105 = $15;
         $106 = $105;
         HEAP32[$106>>2] = $104;
         $107 = (($105) + 4)|0;
         $108 = $107;
         HEAP32[$108>>2] = 0;
         $16 = 1;
         break;
        } else {
         while(1) {
          __THREW__ = 0;
          $119 = (invoke_ii(99,($7|0))|0);
          $120 = __THREW__; __THREW__ = 0;
          $121 = $120&1;
          if ($121) {
           break L1;
          }
          $122 = $119 << 24 >> 24;
          $123 = ($122|0)>=(48);
          if ($123) {
           __THREW__ = 0;
           $124 = (invoke_ii(99,($7|0))|0);
           $125 = __THREW__; __THREW__ = 0;
           $126 = $125&1;
           if ($126) {
            break L1;
           }
           $127 = $124 << 24 >> 24;
           $128 = ($127|0)<=(57);
           $130 = $128;
          } else {
           $130 = 0;
          }
          $129 = $130 ^ 1;
          $131 = $129 ^ 1;
          if (!($131)) {
           break L6;
          }
          $132 = $14;
          $133 = ($132>>>0)>=(429496729);
          $134 = $133 ^ 1;
          $135 = $134 ^ 1;
          if ($135) {
           $136 = $14;
           $137 = ($136|0)!=(429496729);
           if ($137) {
            $144 = 1;
           } else {
            __THREW__ = 0;
            $138 = (invoke_ii(99,($7|0))|0);
            $139 = __THREW__; __THREW__ = 0;
            $140 = $139&1;
            if ($140) {
             break L1;
            }
            $141 = $138 << 24 >> 24;
            $142 = ($141|0)>(53);
            $144 = $142;
           }
           $143 = $144 ^ 1;
           $145 = $143 ^ 1;
           if ($145) {
            break;
           }
          }
          $151 = $14;
          $152 = ($151*10)|0;
          __THREW__ = 0;
          $153 = (invoke_ii(100,($7|0))|0);
          $154 = __THREW__; __THREW__ = 0;
          $155 = $154&1;
          if ($155) {
           break L1;
          }
          $156 = $153 << 24 >> 24;
          $157 = (($156) - 48)|0;
          $158 = (($152) + ($157))|0;
          $14 = $158;
          $159 = $17;
          $160 = (($159) + 1)|0;
          $17 = $160;
         }
         $146 = $14;
         $147 = $15;
         $148 = $147;
         HEAP32[$148>>2] = $146;
         $149 = (($147) + 4)|0;
         $150 = $149;
         HEAP32[$150>>2] = 0;
         $16 = 1;
         break;
        }
       }
      } while(0);
      $19 = 0;
      $175 = $16;
      $176 = $175&1;
      L63: do {
       if ($176) {
        $177 = $13;
        $178 = $177&1;
        if ($178) {
         while(1) {
          __THREW__ = 0;
          $179 = (invoke_ii(99,($7|0))|0);
          $180 = __THREW__; __THREW__ = 0;
          $181 = $180&1;
          if ($181) {
           break L1;
          }
          $182 = $179 << 24 >> 24;
          $183 = ($182|0)>=(48);
          if ($183) {
           __THREW__ = 0;
           $184 = (invoke_ii(99,($7|0))|0);
           $185 = __THREW__; __THREW__ = 0;
           $186 = $185&1;
           if ($186) {
            break L1;
           }
           $187 = $184 << 24 >> 24;
           $188 = ($187|0)<=(57);
           $190 = $188;
          } else {
           $190 = 0;
          }
          $189 = $190 ^ 1;
          $191 = $189 ^ 1;
          if (!($191)) {
           break L63;
          }
          $192 = $15;
          $193 = $192;
          $194 = HEAP32[$193>>2]|0;
          $195 = (($192) + 4)|0;
          $196 = $195;
          $197 = HEAP32[$196>>2]|0;
          $198 = ($197>>>0)>(214748364);
          $199 = ($194>>>0)>=(3435973836);
          $200 = ($197|0)==(214748364);
          $201 = $200 & $199;
          $202 = $198 | $201;
          $203 = $202 ^ 1;
          $204 = $203 ^ 1;
          if ($204) {
           $205 = $15;
           $206 = $205;
           $207 = HEAP32[$206>>2]|0;
           $208 = (($205) + 4)|0;
           $209 = $208;
           $210 = HEAP32[$209>>2]|0;
           $211 = ($207|0)!=(-858993460);
           $212 = ($210|0)!=(214748364);
           $213 = $211 | $212;
           if ($213) {
            $220 = 1;
           } else {
            __THREW__ = 0;
            $214 = (invoke_ii(99,($7|0))|0);
            $215 = __THREW__; __THREW__ = 0;
            $216 = $215&1;
            if ($216) {
             break L1;
            }
            $217 = $214 << 24 >> 24;
            $218 = ($217|0)>(56);
            $220 = $218;
           }
           $219 = $220 ^ 1;
           $221 = $219 ^ 1;
           if ($221) {
            break;
           }
          }
          $229 = $15;
          $230 = $229;
          $231 = HEAP32[$230>>2]|0;
          $232 = (($229) + 4)|0;
          $233 = $232;
          $234 = HEAP32[$233>>2]|0;
          $235 = (___muldi3(($231|0),($234|0),10,0)|0);
          $236 = tempRet0;
          __THREW__ = 0;
          $237 = (invoke_ii(100,($7|0))|0);
          $238 = __THREW__; __THREW__ = 0;
          $239 = $238&1;
          if ($239) {
           break L1;
          }
          $240 = $237 << 24 >> 24;
          $241 = (($240) - 48)|0;
          $242 = (_i64Add(($235|0),($236|0),($241|0),0)|0);
          $243 = tempRet0;
          $244 = $15;
          $245 = $244;
          HEAP32[$245>>2] = $242;
          $246 = (($244) + 4)|0;
          $247 = $246;
          HEAP32[$247>>2] = $243;
          $248 = $17;
          $249 = (($248) + 1)|0;
          $17 = $249;
         }
         $222 = $15;
         $223 = $222;
         $224 = HEAP32[$223>>2]|0;
         $225 = (($222) + 4)|0;
         $226 = $225;
         $227 = HEAP32[$226>>2]|0;
         $228 = (+($224>>>0)) + (4294967296.0*(+($227>>>0)));
         $11 = $228;
         $19 = 1;
         break;
        } else {
         while(1) {
          __THREW__ = 0;
          $250 = (invoke_ii(99,($7|0))|0);
          $251 = __THREW__; __THREW__ = 0;
          $252 = $251&1;
          if ($252) {
           break L1;
          }
          $253 = $250 << 24 >> 24;
          $254 = ($253|0)>=(48);
          if ($254) {
           __THREW__ = 0;
           $255 = (invoke_ii(99,($7|0))|0);
           $256 = __THREW__; __THREW__ = 0;
           $257 = $256&1;
           if ($257) {
            break L1;
           }
           $258 = $255 << 24 >> 24;
           $259 = ($258|0)<=(57);
           $261 = $259;
          } else {
           $261 = 0;
          }
          $260 = $261 ^ 1;
          $262 = $260 ^ 1;
          if (!($262)) {
           break L63;
          }
          $263 = $15;
          $264 = $263;
          $265 = HEAP32[$264>>2]|0;
          $266 = (($263) + 4)|0;
          $267 = $266;
          $268 = HEAP32[$267>>2]|0;
          $269 = ($268>>>0)>(429496729);
          $270 = ($265>>>0)>=(2576980377);
          $271 = ($268|0)==(429496729);
          $272 = $271 & $270;
          $273 = $269 | $272;
          $274 = $273 ^ 1;
          $275 = $274 ^ 1;
          if ($275) {
           $276 = $15;
           $277 = $276;
           $278 = HEAP32[$277>>2]|0;
           $279 = (($276) + 4)|0;
           $280 = $279;
           $281 = HEAP32[$280>>2]|0;
           $282 = ($278|0)!=(-1717986919);
           $283 = ($281|0)!=(429496729);
           $284 = $282 | $283;
           if ($284) {
            $291 = 1;
           } else {
            __THREW__ = 0;
            $285 = (invoke_ii(99,($7|0))|0);
            $286 = __THREW__; __THREW__ = 0;
            $287 = $286&1;
            if ($287) {
             break L1;
            }
            $288 = $285 << 24 >> 24;
            $289 = ($288|0)>(53);
            $291 = $289;
           }
           $290 = $291 ^ 1;
           $292 = $290 ^ 1;
           if ($292) {
            break;
           }
          }
          $300 = $15;
          $301 = $300;
          $302 = HEAP32[$301>>2]|0;
          $303 = (($300) + 4)|0;
          $304 = $303;
          $305 = HEAP32[$304>>2]|0;
          $306 = (___muldi3(($302|0),($305|0),10,0)|0);
          $307 = tempRet0;
          __THREW__ = 0;
          $308 = (invoke_ii(100,($7|0))|0);
          $309 = __THREW__; __THREW__ = 0;
          $310 = $309&1;
          if ($310) {
           break L1;
          }
          $311 = $308 << 24 >> 24;
          $312 = (($311) - 48)|0;
          $313 = (_i64Add(($306|0),($307|0),($312|0),0)|0);
          $314 = tempRet0;
          $315 = $15;
          $316 = $315;
          HEAP32[$316>>2] = $313;
          $317 = (($315) + 4)|0;
          $318 = $317;
          HEAP32[$318>>2] = $314;
          $319 = $17;
          $320 = (($319) + 1)|0;
          $17 = $320;
         }
         $293 = $15;
         $294 = $293;
         $295 = HEAP32[$294>>2]|0;
         $296 = (($293) + 4)|0;
         $297 = $296;
         $298 = HEAP32[$297>>2]|0;
         $299 = (+($295>>>0)) + (4294967296.0*(+($298>>>0)));
         $11 = $299;
         $19 = 1;
         break;
        }
       }
      } while(0);
      $321 = $19;
      $322 = $321&1;
      L101: do {
       if ($322) {
        while(1) {
         __THREW__ = 0;
         $323 = (invoke_ii(99,($7|0))|0);
         $324 = __THREW__; __THREW__ = 0;
         $325 = $324&1;
         if ($325) {
          break L1;
         }
         $326 = $323 << 24 >> 24;
         $327 = ($326|0)>=(48);
         if ($327) {
          __THREW__ = 0;
          $328 = (invoke_ii(99,($7|0))|0);
          $329 = __THREW__; __THREW__ = 0;
          $330 = $329&1;
          if ($330) {
           break L1;
          }
          $331 = $328 << 24 >> 24;
          $332 = ($331|0)<=(57);
          $334 = $332;
         } else {
          $334 = 0;
         }
         $333 = $334 ^ 1;
         $335 = $333 ^ 1;
         if (!($335)) {
          break L101;
         }
         $336 = $11;
         $337 = $336 >= 1.7976931348623158E+307;
         $338 = $337 ^ 1;
         $339 = $338 ^ 1;
         if ($339) {
          __THREW__ = 0;
          $340 = (invoke_ii(81,($29|0))|0);
          $341 = __THREW__; __THREW__ = 0;
          $342 = $341&1;
          if ($342) {
           break L1;
          }
          if ($340) {
           label = 86;
           break;
          }
          $344 = $10;
          __THREW__ = 0;
          invoke_viii(84,($29|0),13,($344|0));
          $345 = __THREW__; __THREW__ = 0;
          $346 = $345&1;
          if ($346) {
           break L1;
          }
          __THREW__ = 0;
          $347 = (invoke_ii(81,($29|0))|0);
          $348 = __THREW__; __THREW__ = 0;
          $349 = $348&1;
          if ($349) {
           break L1;
          }
          $350 = $347 ^ 1;
          $351 = $350 ^ 1;
          if ($351) {
           break;
          }
         }
         $352 = $11;
         $353 = $352 * 10.0;
         __THREW__ = 0;
         $354 = (invoke_ii(100,($7|0))|0);
         $355 = __THREW__; __THREW__ = 0;
         $356 = $355&1;
         if ($356) {
          break L1;
         }
         $357 = $354 << 24 >> 24;
         $358 = (($357) - 48)|0;
         $359 = (+($358|0));
         $360 = $353 + $359;
         $11 = $360;
        }
        if ((label|0) == 86) {
         __THREW__ = 0;
         invoke_viiii(50,(5040|0),(5057|0),1566,(5788|0));
         $343 = __THREW__; __THREW__ = 0;
         break L1;
        }
        $18 = 1;
        __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EED2Ev($6);
        STACKTOP = sp;return;
       }
      } while(0);
      $20 = 0;
      __THREW__ = 0;
      $361 = (invoke_iii(98,($7|0),46)|0);
      $362 = __THREW__; __THREW__ = 0;
      $363 = $362&1;
      if (!($363)) {
       L124: do {
        if ($361) {
         __THREW__ = 0;
         $364 = (invoke_ii(101,($7|0))|0);
         $365 = __THREW__; __THREW__ = 0;
         $366 = $365&1;
         if ($366) {
          break L1;
         }
         $21 = $364;
         __THREW__ = 0;
         $367 = (invoke_ii(99,($7|0))|0);
         $368 = __THREW__; __THREW__ = 0;
         $369 = $368&1;
         if ($369) {
          break L1;
         }
         $370 = $367 << 24 >> 24;
         $371 = ($370|0)>=(48);
         if ($371) {
          __THREW__ = 0;
          $372 = (invoke_ii(99,($7|0))|0);
          $373 = __THREW__; __THREW__ = 0;
          $374 = $373&1;
          if ($374) {
           break L1;
          }
          $375 = $372 << 24 >> 24;
          $376 = ($375|0)<=(57);
          $378 = $376;
         } else {
          $378 = 0;
         }
         $377 = $378 ^ 1;
         $379 = $377 ^ 1;
         $380 = $379 ^ 1;
         do {
          if ($380) {
           __THREW__ = 0;
           $381 = (invoke_ii(81,($29|0))|0);
           $382 = __THREW__; __THREW__ = 0;
           $383 = $382&1;
           if ($383) {
            break L1;
           }
           if ($381) {
            __THREW__ = 0;
            invoke_viiii(50,(5040|0),(5057|0),1578,(5788|0));
            $384 = __THREW__; __THREW__ = 0;
            break L1;
           }
           __THREW__ = 0;
           $385 = (invoke_ii(97,($7|0))|0);
           $386 = __THREW__; __THREW__ = 0;
           $387 = $386&1;
           if ($387) {
            break L1;
           }
           __THREW__ = 0;
           invoke_viii(84,($29|0),14,($385|0));
           $388 = __THREW__; __THREW__ = 0;
           $389 = $388&1;
           if ($389) {
            break L1;
           }
           __THREW__ = 0;
           $390 = (invoke_ii(81,($29|0))|0);
           $391 = __THREW__; __THREW__ = 0;
           $392 = $391&1;
           if ($392) {
            break L1;
           }
           $393 = $390 ^ 1;
           $394 = $393 ^ 1;
           if (!($394)) {
            break;
           }
           $18 = 1;
           __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EED2Ev($6);
           STACKTOP = sp;return;
          }
         } while(0);
         $395 = $19;
         $396 = $395&1;
         if (!($396)) {
          $397 = $16;
          $398 = $397&1;
          if (!($398)) {
           $399 = $14;
           $400 = $15;
           $401 = $400;
           HEAP32[$401>>2] = $399;
           $402 = (($400) + 4)|0;
           $403 = $402;
           HEAP32[$403>>2] = 0;
          }
          while(1) {
           __THREW__ = 0;
           $404 = (invoke_ii(99,($7|0))|0);
           $405 = __THREW__; __THREW__ = 0;
           $406 = $405&1;
           if ($406) {
            break L1;
           }
           $407 = $404 << 24 >> 24;
           $408 = ($407|0)>=(48);
           if ($408) {
            __THREW__ = 0;
            $409 = (invoke_ii(99,($7|0))|0);
            $410 = __THREW__; __THREW__ = 0;
            $411 = $410&1;
            if ($411) {
             break L1;
            }
            $412 = $409 << 24 >> 24;
            $413 = ($412|0)<=(57);
            $415 = $413;
           } else {
            $415 = 0;
           }
           $414 = $415 ^ 1;
           $416 = $414 ^ 1;
           $$not = $416 ^ 1;
           $417 = $15;
           $418 = $417;
           $419 = HEAP32[$418>>2]|0;
           $420 = (($417) + 4)|0;
           $421 = $420;
           $422 = HEAP32[$421>>2]|0;
           $423 = ($422>>>0)>(2097151);
           $424 = ($419>>>0)>(4294967295);
           $425 = ($422|0)==(2097151);
           $426 = $425 & $424;
           $427 = $423 | $426;
           $or$cond = $$not | $427;
           $428 = $15;
           $429 = $428;
           $430 = HEAP32[$429>>2]|0;
           $431 = (($428) + 4)|0;
           $432 = $431;
           $433 = HEAP32[$432>>2]|0;
           if ($or$cond) {
            break;
           }
           $434 = (___muldi3(($430|0),($433|0),10,0)|0);
           $435 = tempRet0;
           __THREW__ = 0;
           $436 = (invoke_ii(100,($7|0))|0);
           $437 = __THREW__; __THREW__ = 0;
           $438 = $437&1;
           if ($438) {
            break L1;
           }
           $439 = $436 << 24 >> 24;
           $440 = (($439) - 48)|0;
           $441 = (_i64Add(($434|0),($435|0),($440|0),0)|0);
           $442 = tempRet0;
           $443 = $15;
           $444 = $443;
           HEAP32[$444>>2] = $441;
           $445 = (($443) + 4)|0;
           $446 = $445;
           HEAP32[$446>>2] = $442;
           $447 = $20;
           $448 = (($447) + -1)|0;
           $20 = $448;
           $449 = $15;
           $450 = $449;
           $451 = HEAP32[$450>>2]|0;
           $452 = (($449) + 4)|0;
           $453 = $452;
           $454 = HEAP32[$453>>2]|0;
           $455 = ($451|0)!=(0);
           $456 = ($454|0)!=(0);
           $457 = $455 | $456;
           if (!($457)) {
            continue;
           }
           $458 = $17;
           $459 = (($458) + 1)|0;
           $17 = $459;
          }
          $460 = (+($430>>>0)) + (4294967296.0*(+($433>>>0)));
          $11 = $460;
          $19 = 1;
         }
         while(1) {
          __THREW__ = 0;
          $461 = (invoke_ii(99,($7|0))|0);
          $462 = __THREW__; __THREW__ = 0;
          $463 = $462&1;
          if ($463) {
           break L1;
          }
          $464 = $461 << 24 >> 24;
          $465 = ($464|0)>=(48);
          if ($465) {
           __THREW__ = 0;
           $466 = (invoke_ii(99,($7|0))|0);
           $467 = __THREW__; __THREW__ = 0;
           $468 = $467&1;
           if ($468) {
            break L1;
           }
           $469 = $466 << 24 >> 24;
           $470 = ($469|0)<=(57);
           $472 = $470;
          } else {
           $472 = 0;
          }
          $471 = $472 ^ 1;
          $473 = $471 ^ 1;
          if (!($473)) {
           break L124;
          }
          $474 = $17;
          $475 = ($474|0)<(17);
          if (!($475)) {
           __THREW__ = 0;
           (invoke_ii(100,($7|0))|0);
           $493 = __THREW__; __THREW__ = 0;
           $494 = $493&1;
           if ($494) {
            break L1;
           } else {
            continue;
           }
          }
          $476 = $11;
          $477 = $476 * 10.0;
          __THREW__ = 0;
          $478 = (invoke_ii(100,($7|0))|0);
          $479 = __THREW__; __THREW__ = 0;
          $480 = $479&1;
          if ($480) {
           break L1;
          }
          $481 = $478 << 24 >> 24;
          $482 = (($481) - 48)|0;
          $483 = (+($482|0));
          $484 = $477 + $483;
          $11 = $484;
          $485 = $20;
          $486 = (($485) + -1)|0;
          $20 = $486;
          $487 = $11;
          $488 = $487 > 0.0;
          $489 = $488 ^ 1;
          $490 = $489 ^ 1;
          if (!($490)) {
           continue;
          }
          $491 = $17;
          $492 = (($491) + 1)|0;
          $17 = $492;
         }
        } else {
         __THREW__ = 0;
         $495 = (invoke_ii(101,($7|0))|0);
         $496 = __THREW__; __THREW__ = 0;
         $497 = $496&1;
         if ($497) {
          break L1;
         }
         $21 = $495;
        }
       } while(0);
       $22 = 0;
       __THREW__ = 0;
       $498 = (invoke_iii(98,($7|0),101)|0);
       $499 = __THREW__; __THREW__ = 0;
       $500 = $499&1;
       if (!($500)) {
        if ($498) {
         label = 137;
        } else {
         __THREW__ = 0;
         $501 = (invoke_iii(98,($7|0),69)|0);
         $502 = __THREW__; __THREW__ = 0;
         $503 = $502&1;
         if ($503) {
          break;
         }
         if ($501) {
          label = 137;
         }
        }
        if ((label|0) == 137) {
         $504 = $19;
         $505 = $504&1;
         if (!($505)) {
          $506 = $16;
          $507 = $506&1;
          $508 = $15;
          $509 = $508;
          $510 = HEAP32[$509>>2]|0;
          $511 = (($508) + 4)|0;
          $512 = $511;
          $513 = HEAP32[$512>>2]|0;
          $514 = $14;
          $515 = $507 ? $510 : $514;
          $516 = $507 ? $513 : 0;
          $517 = (+($515>>>0)) + (4294967296.0*(+($516>>>0)));
          $11 = $517;
          $19 = 1;
         }
         $23 = 0;
         __THREW__ = 0;
         $518 = (invoke_iii(98,($7|0),43)|0);
         $519 = __THREW__; __THREW__ = 0;
         $520 = $519&1;
         if ($520) {
          break;
         }
         if (!($518)) {
          __THREW__ = 0;
          $521 = (invoke_iii(98,($7|0),45)|0);
          $522 = __THREW__; __THREW__ = 0;
          $523 = $522&1;
          if ($523) {
           break;
          }
          if ($521) {
           $23 = 1;
          }
         }
         __THREW__ = 0;
         $524 = (invoke_ii(99,($7|0))|0);
         $525 = __THREW__; __THREW__ = 0;
         $526 = $525&1;
         if ($526) {
          break;
         }
         $527 = $524 << 24 >> 24;
         $528 = ($527|0)>=(48);
         if ($528) {
          __THREW__ = 0;
          $529 = (invoke_ii(99,($7|0))|0);
          $530 = __THREW__; __THREW__ = 0;
          $531 = $530&1;
          if ($531) {
           break;
          }
          $532 = $529 << 24 >> 24;
          $533 = ($532|0)<=(57);
          $535 = $533;
         } else {
          $535 = 0;
         }
         $534 = $535 ^ 1;
         $536 = $534 ^ 1;
         L195: do {
          if ($536) {
           __THREW__ = 0;
           $537 = (invoke_ii(102,($7|0))|0);
           $538 = __THREW__; __THREW__ = 0;
           $539 = $538&1;
           if ($539) {
            break L1;
           }
           $540 = $537 << 24 >> 24;
           $541 = (($540) - 48)|0;
           $22 = $541;
           $542 = $23;
           $543 = $542&1;
           if ($543) {
            L199: while(1) {
             __THREW__ = 0;
             $544 = (invoke_ii(99,($7|0))|0);
             $545 = __THREW__; __THREW__ = 0;
             $546 = $545&1;
             if ($546) {
              break L1;
             }
             $547 = $544 << 24 >> 24;
             $548 = ($547|0)>=(48);
             if ($548) {
              __THREW__ = 0;
              $549 = (invoke_ii(99,($7|0))|0);
              $550 = __THREW__; __THREW__ = 0;
              $551 = $550&1;
              if ($551) {
               break L1;
              }
              $552 = $549 << 24 >> 24;
              $553 = ($552|0)<=(57);
              $555 = $553;
             } else {
              $555 = 0;
             }
             $554 = $555 ^ 1;
             $556 = $554 ^ 1;
             if (!($556)) {
              break L195;
             }
             $557 = $22;
             $558 = ($557*10)|0;
             __THREW__ = 0;
             $559 = (invoke_ii(102,($7|0))|0);
             $560 = __THREW__; __THREW__ = 0;
             $561 = $560&1;
             if ($561) {
              break L1;
             }
             $562 = $559 << 24 >> 24;
             $563 = (($562) - 48)|0;
             $564 = (($558) + ($563))|0;
             $22 = $564;
             $565 = $22;
             $566 = ($565|0)>=(214748364);
             if (!($566)) {
              continue;
             }
             while(1) {
              __THREW__ = 0;
              $567 = (invoke_ii(99,($7|0))|0);
              $568 = __THREW__; __THREW__ = 0;
              $569 = $568&1;
              if ($569) {
               break L1;
              }
              $570 = $567 << 24 >> 24;
              $571 = ($570|0)>=(48);
              if ($571) {
               __THREW__ = 0;
               $572 = (invoke_ii(99,($7|0))|0);
               $573 = __THREW__; __THREW__ = 0;
               $574 = $573&1;
               if ($574) {
                break L1;
               }
               $575 = $572 << 24 >> 24;
               $576 = ($575|0)<=(57);
               $578 = $576;
              } else {
               $578 = 0;
              }
              $577 = $578 ^ 1;
              $579 = $577 ^ 1;
              if (!($579)) {
               continue L199;
              }
              __THREW__ = 0;
              (invoke_ii(102,($7|0))|0);
              $580 = __THREW__; __THREW__ = 0;
              $581 = $580&1;
              if ($581) {
               break L1;
              }
             }
            }
           }
           $582 = $20;
           $583 = (308 - ($582))|0;
           $24 = $583;
           while(1) {
            __THREW__ = 0;
            $584 = (invoke_ii(99,($7|0))|0);
            $585 = __THREW__; __THREW__ = 0;
            $586 = $585&1;
            if ($586) {
             break L1;
            }
            $587 = $584 << 24 >> 24;
            $588 = ($587|0)>=(48);
            if ($588) {
             __THREW__ = 0;
             $589 = (invoke_ii(99,($7|0))|0);
             $590 = __THREW__; __THREW__ = 0;
             $591 = $590&1;
             if ($591) {
              break L1;
             }
             $592 = $589 << 24 >> 24;
             $593 = ($592|0)<=(57);
             $595 = $593;
            } else {
             $595 = 0;
            }
            $594 = $595 ^ 1;
            $596 = $594 ^ 1;
            if (!($596)) {
             break L195;
            }
            $597 = $22;
            $598 = ($597*10)|0;
            __THREW__ = 0;
            $599 = (invoke_ii(102,($7|0))|0);
            $600 = __THREW__; __THREW__ = 0;
            $601 = $600&1;
            if ($601) {
             break L1;
            }
            $602 = $599 << 24 >> 24;
            $603 = (($602) - 48)|0;
            $604 = (($598) + ($603))|0;
            $22 = $604;
            $605 = $22;
            $606 = $24;
            $607 = ($605|0)>($606|0);
            $608 = $607 ^ 1;
            $609 = $608 ^ 1;
            if (!($609)) {
             continue;
            }
            __THREW__ = 0;
            $610 = (invoke_ii(81,($29|0))|0);
            $611 = __THREW__; __THREW__ = 0;
            $612 = $611&1;
            if ($612) {
             break L1;
            }
            if ($610) {
             label = 174;
             break;
            }
            $614 = $10;
            __THREW__ = 0;
            invoke_viii(84,($29|0),13,($614|0));
            $615 = __THREW__; __THREW__ = 0;
            $616 = $615&1;
            if ($616) {
             break L1;
            }
            __THREW__ = 0;
            $617 = (invoke_ii(81,($29|0))|0);
            $618 = __THREW__; __THREW__ = 0;
            $619 = $618&1;
            if ($619) {
             break L1;
            }
            $620 = $617 ^ 1;
            $621 = $620 ^ 1;
            if ($621) {
             break;
            }
           }
           if ((label|0) == 174) {
            __THREW__ = 0;
            invoke_viiii(50,(5040|0),(5057|0),1649,(5788|0));
            $613 = __THREW__; __THREW__ = 0;
            break L1;
           }
           $18 = 1;
           __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EED2Ev($6);
           STACKTOP = sp;return;
          } else {
           __THREW__ = 0;
           $622 = (invoke_ii(81,($29|0))|0);
           $623 = __THREW__; __THREW__ = 0;
           $624 = $623&1;
           if ($624) {
            break L1;
           }
           if ($622) {
            __THREW__ = 0;
            invoke_viiii(50,(5040|0),(5057|0),1654,(5788|0));
            $625 = __THREW__; __THREW__ = 0;
            break L1;
           }
           __THREW__ = 0;
           $626 = (invoke_ii(97,($7|0))|0);
           $627 = __THREW__; __THREW__ = 0;
           $628 = $627&1;
           if ($628) {
            break L1;
           }
           __THREW__ = 0;
           invoke_viii(84,($29|0),15,($626|0));
           $629 = __THREW__; __THREW__ = 0;
           $630 = $629&1;
           if ($630) {
            break L1;
           }
           __THREW__ = 0;
           $631 = (invoke_ii(81,($29|0))|0);
           $632 = __THREW__; __THREW__ = 0;
           $633 = $632&1;
           if ($633) {
            break L1;
           }
           $634 = $631 ^ 1;
           $635 = $634 ^ 1;
           if (!($635)) {
            break;
           }
           $18 = 1;
           __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EED2Ev($6);
           STACKTOP = sp;return;
          }
         } while(0);
         $636 = $23;
         $637 = $636&1;
         if ($637) {
          $638 = $22;
          $639 = (0 - ($638))|0;
          $22 = $639;
         }
        }
        $25 = 1;
        __THREW__ = 0;
        $640 = (invoke_ii(101,($7|0))|0);
        $641 = __THREW__; __THREW__ = 0;
        $642 = $641&1;
        if (!($642)) {
         $26 = $640;
         __THREW__ = 0;
         $643 = (invoke_ii(103,($7|0))|0);
         $644 = __THREW__; __THREW__ = 0;
         $645 = $644&1;
         if (!($645)) {
          $27 = $643;
          $646 = $19;
          $647 = $646&1;
          do {
           if ($647) {
            $648 = $22;
            $649 = $20;
            $650 = (($648) + ($649))|0;
            $28 = $650;
            $651 = $11;
            $652 = $28;
            __THREW__ = 0;
            $653 = (+invoke_ddi(104,(+$651),($652|0)));
            $654 = __THREW__; __THREW__ = 0;
            $655 = $654&1;
            if ($655) {
             break L1;
            }
            $11 = $653;
            $656 = $5;
            $657 = $13;
            $658 = $657&1;
            $659 = $11;
            $660 = -$659;
            $661 = $658 ? $660 : $659;
            __THREW__ = 0;
            $662 = (invoke_iid(105,($656|0),(+$661))|0);
            $663 = __THREW__; __THREW__ = 0;
            $664 = $663&1;
            if ($664) {
             break L1;
            }
            $665 = $662&1;
            $25 = $665;
           } else {
            $666 = $12;
            $667 = $666&1;
            if ($667) {
             $668 = $5;
             $669 = $11;
             __THREW__ = 0;
             $670 = (invoke_iid(105,($668|0),(+$669))|0);
             $671 = __THREW__; __THREW__ = 0;
             $672 = $671&1;
             if ($672) {
              break L1;
             }
             $673 = $670&1;
             $25 = $673;
             break;
            }
            $674 = $16;
            $675 = $674&1;
            $676 = $13;
            $677 = $676&1;
            $678 = $5;
            if ($675) {
             $679 = $15;
             $680 = $679;
             $681 = HEAP32[$680>>2]|0;
             $682 = (($679) + 4)|0;
             $683 = $682;
             $684 = HEAP32[$683>>2]|0;
             if ($677) {
              $685 = $681 ^ -1;
              $686 = $684 ^ -1;
              $687 = (_i64Add(($685|0),($686|0),1,0)|0);
              $688 = tempRet0;
              __THREW__ = 0;
              $689 = (invoke_iiii(106,($678|0),($687|0),($688|0))|0);
              $690 = __THREW__; __THREW__ = 0;
              $691 = $690&1;
              if ($691) {
               break L1;
              }
              $692 = $689&1;
              $25 = $692;
              break;
             } else {
              __THREW__ = 0;
              $693 = (invoke_iiii(107,($678|0),($681|0),($684|0))|0);
              $694 = __THREW__; __THREW__ = 0;
              $695 = $694&1;
              if ($695) {
               break L1;
              }
              $696 = $693&1;
              $25 = $696;
              break;
             }
            } else {
             $697 = $14;
             if ($677) {
              $698 = $697 ^ -1;
              $699 = (($698) + 1)|0;
              __THREW__ = 0;
              $700 = (invoke_iii(108,($678|0),($699|0))|0);
              $701 = __THREW__; __THREW__ = 0;
              $702 = $701&1;
              if ($702) {
               break L1;
              }
              $703 = $700&1;
              $25 = $703;
              break;
             } else {
              __THREW__ = 0;
              $704 = (invoke_iii(109,($678|0),($697|0))|0);
              $705 = __THREW__; __THREW__ = 0;
              $706 = $705&1;
              if ($706) {
               break L1;
              }
              $707 = $704&1;
              $25 = $707;
              break;
             }
            }
           }
          } while(0);
          $708 = $25;
          $709 = $708&1;
          $710 = $709 ^ 1;
          $711 = $710 ^ 1;
          $712 = $711 ^ 1;
          do {
           if ($712) {
            __THREW__ = 0;
            $713 = (invoke_ii(81,($29|0))|0);
            $714 = __THREW__; __THREW__ = 0;
            $715 = $714&1;
            if ($715) {
             break L1;
            }
            if ($713) {
             __THREW__ = 0;
             invoke_viiii(50,(5040|0),(5057|0),1718,(5788|0));
             $716 = __THREW__; __THREW__ = 0;
             break L1;
            }
            $717 = $10;
            __THREW__ = 0;
            invoke_viii(84,($29|0),16,($717|0));
            $718 = __THREW__; __THREW__ = 0;
            $719 = $718&1;
            if ($719) {
             break L1;
            }
            __THREW__ = 0;
            $720 = (invoke_ii(81,($29|0))|0);
            $721 = __THREW__; __THREW__ = 0;
            $722 = $721&1;
            if ($722) {
             break L1;
            }
            $723 = $720 ^ 1;
            $724 = $723 ^ 1;
            if (!($724)) {
             break;
            }
            $18 = 1;
            __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EED2Ev($6);
            STACKTOP = sp;return;
           }
          } while(0);
          $18 = 0;
          __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EED2Ev($6);
          STACKTOP = sp;return;
         }
        }
       }
      }
     }
    }
   }
  }
 } while(0);
 $53 = ___cxa_find_matching_catch_2()|0;
 $54 = tempRet0;
 $8 = $53;
 $9 = $54;
 __ZN9rapidjson8internal15StreamLocalCopyINS_19GenericStringStreamINS_4UTF8IcEEEELi1EED2Ev($6);
 $55 = $8;
 $56 = $9;
 ___resumeException($55|0);
 // unreachable;
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$expand_i1_val = 0, $$expand_i1_val2 = 0, $$pre_trunc = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp + 5|0;
 $3 = $0;
 $4 = $1;
 $5 = $3;
 $6 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4PeekEv($5)|0);
 $7 = $6 << 24 >> 24;
 $8 = $4;
 $9 = $8 << 24 >> 24;
 $10 = ($7|0)==($9|0);
 $11 = $10 ^ 1;
 $12 = $11 ^ 1;
 if ($12) {
  $13 = $3;
  (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($13)|0);
  $$expand_i1_val = 1;
  HEAP8[$2>>0] = $$expand_i1_val;
  $$pre_trunc = HEAP8[$2>>0]|0;
  $14 = $$pre_trunc&1;
  STACKTOP = sp;return ($14|0);
 } else {
  $$expand_i1_val2 = 0;
  HEAP8[$2>>0] = $$expand_i1_val2;
  $$pre_trunc = HEAP8[$2>>0]|0;
  $14 = $$pre_trunc&1;
  STACKTOP = sp;return ($14|0);
 }
 return (0)|0;
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E4NullEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 32|0);
 $4 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($3,1)|0);
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2Ev($4);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE7ReserveINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEvj($4,$5);
 $6 = $3;
 $7 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE10PushUnsafeINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($4,$6)|0);
 STACKTOP = sp;return ($7|0);
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE7ReserveINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEvj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = ((($4)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $3;
 $8 = ($7*24)|0;
 $9 = (($6) + ($8)|0);
 $10 = ((($4)) + 16|0);
 $11 = HEAP32[$10>>2]|0;
 $12 = ($9>>>0)>($11>>>0);
 $13 = $12 ^ 1;
 $14 = $13 ^ 1;
 if (!($14)) {
  STACKTOP = sp;return;
 }
 $15 = $3;
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE6ExpandINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEvj($4,$15);
 STACKTOP = sp;return;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE10PushUnsafeINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $5 = $2;
 $6 = ((($5)) + 12|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)!=(0|0);
 if (!($8)) {
  ___assert_fail((5127|0),(4982|0),129,(5137|0));
  // unreachable;
 }
 $9 = ((($5)) + 12|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = $3;
 $12 = ($11*24)|0;
 $13 = (($10) + ($12)|0);
 $14 = ((($5)) + 16|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = ($13>>>0)<=($15>>>0);
 if ($16) {
  $17 = ((($5)) + 12|0);
  $18 = HEAP32[$17>>2]|0;
  $4 = $18;
  $19 = $3;
  $20 = ($19*24)|0;
  $21 = ((($5)) + 12|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = (($22) + ($20)|0);
  HEAP32[$21>>2] = $23;
  $24 = $4;
  STACKTOP = sp;return ($24|0);
 } else {
  ___assert_fail((5148|0),(4982|0),130,(5137|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE6ExpandINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEvj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $6 = $2;
 $7 = ((($6)) + 8|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)==(0|0);
 if ($9) {
  $10 = HEAP32[$6>>2]|0;
  $11 = ($10|0)!=(0|0);
  if (!($11)) {
   $12 = (__Znwj(1)|0);
   HEAP32[$6>>2] = $12;
   $13 = ((($6)) + 4|0);
   HEAP32[$13>>2] = $12;
  }
  $14 = ((($6)) + 20|0);
  $15 = HEAP32[$14>>2]|0;
  $4 = $15;
 } else {
  $16 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE11GetCapacityEv($6)|0);
  $4 = $16;
  $17 = $4;
  $18 = (($17) + 1)|0;
  $19 = (($18>>>0) / 2)&-1;
  $20 = $4;
  $21 = (($20) + ($19))|0;
  $4 = $21;
 }
 $22 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE7GetSizeEv($6)|0);
 $23 = $3;
 $24 = ($23*24)|0;
 $25 = (($22) + ($24))|0;
 $5 = $25;
 $26 = $4;
 $27 = $5;
 $28 = ($26>>>0)<($27>>>0);
 if (!($28)) {
  $30 = $4;
  __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE6ResizeEj($6,$30);
  STACKTOP = sp;return;
 }
 $29 = $5;
 $4 = $29;
 $30 = $4;
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE6ResizeEj($6,$30);
 STACKTOP = sp;return;
}
function __ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE11GetCapacityEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($2)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $4;
 $8 = $6;
 $9 = (($7) - ($8))|0;
 STACKTOP = sp;return ($9|0);
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE6ResizeEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $5 = $2;
 $6 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE7GetSizeEv($5)|0);
 $4 = $6;
 $7 = HEAP32[$5>>2]|0;
 $8 = ((($5)) + 8|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE11GetCapacityEv($5)|0);
 $11 = $3;
 $12 = (__ZN9rapidjson12CrtAllocator7ReallocEPvjj($7,$9,$10,$11)|0);
 $13 = ((($5)) + 8|0);
 HEAP32[$13>>2] = $12;
 $14 = ((($5)) + 8|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = $4;
 $17 = (($15) + ($16)|0);
 $18 = ((($5)) + 12|0);
 HEAP32[$18>>2] = $17;
 $19 = ((($5)) + 8|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = $3;
 $22 = (($20) + ($21)|0);
 $23 = ((($5)) + 16|0);
 HEAP32[$23>>2] = $22;
 STACKTOP = sp;return;
}
function __ZN9rapidjson12CrtAllocator7ReallocEPvjj($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $8;
 $10 = ($9|0)==(0);
 $11 = $6;
 if ($10) {
  _free($11);
  $4 = 0;
 } else {
  $12 = $8;
  $13 = (_realloc($11,$12)|0);
  $4 = $13;
 }
 $14 = $4;
 STACKTOP = sp;return ($14|0);
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E4BoolEb($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $4 = $1&1;
 $3 = $4;
 $5 = $2;
 $6 = ((($5)) + 32|0);
 $7 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($6,1)|0);
 $8 = $3;
 $9 = $8&1;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2IbEET_PNS_8internal8EnableIfINS9_15RemoveSfinaeTagIPFRNS9_9SfinaeTagENS9_6IsSameIbS8_EEEE4TypeEvE4TypeE($7,$9,0);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2IbEET_PNS_8internal8EnableIfINS9_15RemoveSfinaeTagIPFRNS9_9SfinaeTagENS9_6IsSameIbS8_EEEE4TypeEvE4TypeE($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $6 = $1&1;
 $4 = $6;
 $5 = $2;
 $7 = $3;
 ;HEAP32[$7>>2]=0|0;HEAP32[$7+4>>2]=0|0;HEAP32[$7+8>>2]=0|0;HEAP32[$7+12>>2]=0|0;HEAP32[$7+16>>2]=0|0;HEAP32[$7+20>>2]=0|0;
 $8 = $4;
 $9 = $8&1;
 $10 = $9 ? 10 : 9;
 $11 = $10&65535;
 $12 = ((($7)) + 18|0);
 HEAP16[$12>>1] = $11;
 STACKTOP = sp;return;
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcEC2ERNS_8internal5StackIS3_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 HEAP32[$4>>2] = $5;
 $6 = ((($4)) + 4|0);
 HEAP32[$6>>2] = 0;
 STACKTOP = sp;return;
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE19ParseStringToStreamILj0ES2_S2_NS_19GenericStringStreamIS2_EENS4_11StackStreamIcEEEEvRT2_RT3_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $12 = $3;
 while(1) {
  $13 = $4;
  $14 = $5;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE23ScanCopyUnescapedStringINS_19GenericStringStreamIS2_EENS4_11StackStreamIcEEEEvRT_RT0_($13,$14);
  $15 = $4;
  $16 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4PeekEv($15)|0);
  $6 = $16;
  $17 = $6;
  $18 = $17 << 24 >> 24;
  $19 = ($18|0)==(92);
  $20 = $19 ^ 1;
  $21 = $20 ^ 1;
  if (!($21)) {
   $104 = $6;
   $105 = $104 << 24 >> 24;
   $106 = ($105|0)==(34);
   $107 = $106 ^ 1;
   $108 = $107 ^ 1;
   if ($108) {
    label = 25;
    break;
   }
   $111 = $6;
   $112 = $111 << 24 >> 24;
   $113 = ($112>>>0)<(32);
   $114 = $113 ^ 1;
   $115 = $114 ^ 1;
   if (!($115)) {
    $130 = $4;
    $131 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($130)|0);
    $11 = $131;
    $132 = $4;
    $133 = $5;
    $134 = (__ZN9rapidjson10TranscoderINS_4UTF8IcEES2_E9TranscodeINS_19GenericStringStreamIS2_EENS_13GenericReaderIS2_S2_NS_12CrtAllocatorEE11StackStreamIcEEEEbRT_RT0_($132,$133)|0);
    $135 = $134 ^ 1;
    $136 = $135 ^ 1;
    $137 = $136 ^ 1;
    if (!($137)) {
     continue;
    }
    $138 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($12)|0);
    if ($138) {
     label = 36;
     break;
    }
    $139 = $11;
    __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($12,12,$139);
    $140 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($12)|0);
    $141 = $140 ^ 1;
    $142 = $141 ^ 1;
    if ($142) {
     label = 38;
     break;
    } else {
     continue;
    }
   }
   $116 = $6;
   $117 = $116 << 24 >> 24;
   $118 = ($117|0)==(0);
   $119 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($12)|0);
   if ($118) {
    if ($119) {
     label = 29;
     break;
    }
    $120 = $4;
    $121 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($120)|0);
    __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($12,11,$121);
    $122 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($12)|0);
    $123 = $122 ^ 1;
    $124 = $123 ^ 1;
    if ($124) {
     label = 38;
     break;
    } else {
     continue;
    }
   } else {
    if ($119) {
     label = 32;
     break;
    }
    $125 = $4;
    $126 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($125)|0);
    __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($12,12,$126);
    $127 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($12)|0);
    $128 = $127 ^ 1;
    $129 = $128 ^ 1;
    if ($129) {
     label = 38;
     break;
    } else {
     continue;
    }
   }
  }
  $22 = $4;
  $23 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($22)|0);
  $7 = $23;
  $24 = $4;
  (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($24)|0);
  $25 = $4;
  $26 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4PeekEv($25)|0);
  $8 = $26;
  $27 = $8;
  $28 = $27&255;
  $29 = (5275 + ($28)|0);
  $30 = HEAP8[$29>>0]|0;
  $31 = ($30<<24>>24)!=(0);
  $32 = $31 ^ 1;
  $33 = $32 ^ 1;
  if ($33) {
   $34 = $4;
   (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($34)|0);
   $35 = $5;
   $36 = $8;
   $37 = $36&255;
   $38 = (5275 + ($37)|0);
   $39 = HEAP8[$38>>0]|0;
   __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE3PutEc($35,$39);
   continue;
  }
  $40 = $8;
  $41 = $40 << 24 >> 24;
  $42 = ($41|0)==(117);
  $43 = $42 ^ 1;
  $44 = $43 ^ 1;
  if (!($44)) {
   $99 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($12)|0);
   if ($99) {
    label = 22;
    break;
   }
   $100 = $7;
   __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($12,10,$100);
   $101 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($12)|0);
   $102 = $101 ^ 1;
   $103 = $102 ^ 1;
   if ($103) {
    label = 38;
    break;
   } else {
    continue;
   }
  }
  $45 = $4;
  (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($45)|0);
  $46 = $4;
  $47 = $7;
  $48 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE9ParseHex4INS_19GenericStringStreamIS2_EEEEjRT_j($12,$46,$47)|0);
  $9 = $48;
  $49 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($12)|0);
  $50 = $49 ^ 1;
  $51 = $50 ^ 1;
  if ($51) {
   label = 38;
   break;
  }
  $52 = $9;
  $53 = ($52>>>0)>=(55296);
  $54 = $9;
  $55 = ($54>>>0)<=(56319);
  $56 = $53 ? $55 : 0;
  $57 = $56 ^ 1;
  $58 = $57 ^ 1;
  if ($58) {
   $59 = $4;
   $60 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($59,92)|0);
   if ($60) {
    $61 = $4;
    $62 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS_19GenericStringStreamIS2_EEEEbRT_NS8_2ChE($61,117)|0);
    $63 = $62 ^ 1;
    $65 = $63;
   } else {
    $65 = 1;
   }
   $64 = $65 ^ 1;
   $66 = $64 ^ 1;
   if ($66) {
    $67 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($12)|0);
    if ($67) {
     label = 12;
     break;
    }
    $68 = $7;
    __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($12,9,$68);
    $69 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($12)|0);
    $70 = $69 ^ 1;
    $71 = $70 ^ 1;
    if ($71) {
     label = 38;
     break;
    }
   }
   $72 = $4;
   $73 = $7;
   $74 = (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE9ParseHex4INS_19GenericStringStreamIS2_EEEEjRT_j($12,$72,$73)|0);
   $10 = $74;
   $75 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($12)|0);
   $76 = $75 ^ 1;
   $77 = $76 ^ 1;
   if ($77) {
    label = 38;
    break;
   }
   $78 = $10;
   $79 = ($78>>>0)<(56320);
   $80 = $10;
   $81 = ($80>>>0)>(57343);
   $82 = $79 ? 1 : $81;
   $83 = $82 ^ 1;
   $84 = $83 ^ 1;
   if ($84) {
    $85 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($12)|0);
    if ($85) {
     label = 17;
     break;
    }
    $86 = $7;
    __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($12,9,$86);
    $87 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($12)|0);
    $88 = $87 ^ 1;
    $89 = $88 ^ 1;
    if ($89) {
     label = 38;
     break;
    }
   }
   $90 = $9;
   $91 = (($90) - 55296)|0;
   $92 = $91 << 10;
   $93 = $10;
   $94 = (($93) - 56320)|0;
   $95 = $92 | $94;
   $96 = (($95) + 65536)|0;
   $9 = $96;
  }
  $97 = $5;
  $98 = $9;
  __ZN9rapidjson4UTF8IcE6EncodeINS_13GenericReaderIS1_S1_NS_12CrtAllocatorEE11StackStreamIcEEEEvRT_j($97,$98);
 }
 if ((label|0) == 12) {
  ___assert_fail((5040|0),(5057|0),1024,(5531|0));
  // unreachable;
 }
 else if ((label|0) == 17) {
  ___assert_fail((5040|0),(5057|0),1028,(5531|0));
  // unreachable;
 }
 else if ((label|0) == 22) {
  ___assert_fail((5040|0),(5057|0),1034,(5531|0));
  // unreachable;
 }
 else if ((label|0) == 25) {
  $109 = $4;
  (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($109)|0);
  $110 = $5;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE3PutEc($110,0);
  STACKTOP = sp;return;
 }
 else if ((label|0) == 29) {
  ___assert_fail((5040|0),(5057|0),1043,(5531|0));
  // unreachable;
 }
 else if ((label|0) == 32) {
  ___assert_fail((5040|0),(5057|0),1045,(5531|0));
  // unreachable;
 }
 else if ((label|0) == 36) {
  ___assert_fail((5040|0),(5057|0),1052,(5531|0));
  // unreachable;
 }
 else if ((label|0) == 38) {
  STACKTOP = sp;return;
 }
}
function __ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE6LengthEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 STACKTOP = sp;return ($4|0);
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE3PopEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = ((($2)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3PopIcEEPT_j($3,$5)|0);
 STACKTOP = sp;return ($6|0);
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E3KeyEPKcjb($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $8 = $3&1;
 $7 = $8;
 $9 = $4;
 $10 = $5;
 $11 = $6;
 $12 = $7;
 $13 = $12&1;
 $14 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E6StringEPKcjb($9,$10,$11,$13)|0);
 STACKTOP = sp;return ($14|0);
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E6StringEPKcjb($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $8 = $3&1;
 $7 = $8;
 $9 = $4;
 $10 = $7;
 $11 = $10&1;
 $12 = ((($9)) + 32|0);
 $13 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($12,1)|0);
 $14 = $5;
 $15 = $6;
 if ($11) {
  $16 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E12GetAllocatorEv($9)|0);
  __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2EPKcjRS5_($13,$14,$15,$16);
  STACKTOP = sp;return 1;
 } else {
  __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2EPKcj($13,$14,$15);
  STACKTOP = sp;return 1;
 }
 return (0)|0;
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE23ScanCopyUnescapedStringINS_19GenericStringStreamIS2_EENS4_11StackStreamIcEEEEvRT_RT0_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 STACKTOP = sp;return;
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE3PutEc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = HEAP32[$4>>2]|0;
 $7 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushIcEEPT_j($6,1)|0);
 HEAP8[$7>>0] = $5;
 $8 = ((($4)) + 4|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = (($9) + 1)|0;
 HEAP32[$8>>2] = $10;
 STACKTOP = sp;return;
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE9ParseHex4INS_19GenericStringStreamIS2_EEEEjRT_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $10 = $4;
 $7 = 0;
 $8 = 0;
 L1: while(1) {
  $11 = $8;
  $12 = ($11|0)<(4);
  if (!($12)) {
   label = 17;
   break;
  }
  $13 = $5;
  $14 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4PeekEv($13)|0);
  $9 = $14;
  $15 = $7;
  $16 = $15 << 4;
  $7 = $16;
  $17 = $9;
  $18 = $17 << 24 >> 24;
  $19 = $7;
  $20 = (($19) + ($18))|0;
  $7 = $20;
  $21 = $9;
  $22 = $21 << 24 >> 24;
  $23 = ($22|0)>=(48);
  if ($23) {
   $24 = $9;
   $25 = $24 << 24 >> 24;
   $26 = ($25|0)<=(57);
   if ($26) {
    $27 = $7;
    $28 = (($27) - 48)|0;
    $7 = $28;
   } else {
    label = 6;
   }
  } else {
   label = 6;
  }
  do {
   if ((label|0) == 6) {
    label = 0;
    $29 = $9;
    $30 = $29 << 24 >> 24;
    $31 = ($30|0)>=(65);
    if ($31) {
     $32 = $9;
     $33 = $32 << 24 >> 24;
     $34 = ($33|0)<=(70);
     if ($34) {
      $35 = $7;
      $36 = (($35) - 55)|0;
      $7 = $36;
      break;
     }
    }
    $37 = $9;
    $38 = $37 << 24 >> 24;
    $39 = ($38|0)>=(97);
    if ($39) {
     $40 = $9;
     $41 = $40 << 24 >> 24;
     $42 = ($41|0)<=(102);
     if ($42) {
      $43 = $7;
      $44 = (($43) - 87)|0;
      $7 = $44;
      break;
     }
    }
    $45 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($10)|0);
    if ($45) {
     label = 13;
     break L1;
    }
    $46 = $6;
    __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj($10,8,$46);
    $47 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv($10)|0);
    $48 = $47 ^ 1;
    $49 = $48 ^ 1;
    if ($49) {
     label = 15;
     break L1;
    }
   }
  } while(0);
  $50 = $5;
  (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($50)|0);
  $51 = $8;
  $52 = (($51) + 1)|0;
  $8 = $52;
 }
 if ((label|0) == 13) {
  ___assert_fail((5040|0),(5057|0),918,(5551|0));
  // unreachable;
 }
 else if ((label|0) == 15) {
  $3 = 0;
  $54 = $3;
  STACKTOP = sp;return ($54|0);
 }
 else if ((label|0) == 17) {
  $53 = $7;
  $3 = $53;
  $54 = $3;
  STACKTOP = sp;return ($54|0);
 }
 return (0)|0;
}
function __ZN9rapidjson4UTF8IcE6EncodeINS_13GenericReaderIS1_S1_NS_12CrtAllocatorEE11StackStreamIcEEEEvRT_j($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = ($4>>>0)<=(127);
 if ($5) {
  $6 = $2;
  $7 = $3;
  $8 = $7 & 255;
  $9 = $8&255;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE3PutEc($6,$9);
  STACKTOP = sp;return;
 }
 $10 = $3;
 $11 = ($10>>>0)<=(2047);
 if ($11) {
  $12 = $2;
  $13 = $3;
  $14 = $13 >>> 6;
  $15 = $14 & 255;
  $16 = 192 | $15;
  $17 = $16&255;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE3PutEc($12,$17);
  $18 = $2;
  $19 = $3;
  $20 = $19 & 63;
  $21 = 128 | $20;
  $22 = $21&255;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE3PutEc($18,$22);
  STACKTOP = sp;return;
 }
 $23 = $3;
 $24 = ($23>>>0)<=(65535);
 if ($24) {
  $25 = $2;
  $26 = $3;
  $27 = $26 >>> 12;
  $28 = $27 & 255;
  $29 = 224 | $28;
  $30 = $29&255;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE3PutEc($25,$30);
  $31 = $2;
  $32 = $3;
  $33 = $32 >>> 6;
  $34 = $33 & 63;
  $35 = 128 | $34;
  $36 = $35&255;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE3PutEc($31,$36);
  $37 = $2;
  $38 = $3;
  $39 = $38 & 63;
  $40 = 128 | $39;
  $41 = $40&255;
  __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE3PutEc($37,$41);
  STACKTOP = sp;return;
 }
 $42 = $3;
 $43 = ($42>>>0)<=(1114111);
 if (!($43)) {
  ___assert_fail((5561|0),(5583|0),115,(5623|0));
  // unreachable;
 }
 $44 = $2;
 $45 = $3;
 $46 = $45 >>> 18;
 $47 = $46 & 255;
 $48 = 240 | $47;
 $49 = $48&255;
 __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE3PutEc($44,$49);
 $50 = $2;
 $51 = $3;
 $52 = $51 >>> 12;
 $53 = $52 & 63;
 $54 = 128 | $53;
 $55 = $54&255;
 __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE3PutEc($50,$55);
 $56 = $2;
 $57 = $3;
 $58 = $57 >>> 6;
 $59 = $58 & 63;
 $60 = 128 | $59;
 $61 = $60&255;
 __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE3PutEc($56,$61);
 $62 = $2;
 $63 = $3;
 $64 = $63 & 63;
 $65 = 128 | $64;
 $66 = $65&255;
 __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE3PutEc($62,$66);
 STACKTOP = sp;return;
}
function __ZN9rapidjson10TranscoderINS_4UTF8IcEES2_E9TranscodeINS_19GenericStringStreamIS2_EENS_13GenericReaderIS2_S2_NS_12CrtAllocatorEE11StackStreamIcEEEEbRT_RT0_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = $2;
 $6 = (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($5)|0);
 __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE3PutEc($4,$6);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushIcEEPT_j($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE7ReserveIcEEvj($4,$5);
 $6 = $3;
 $7 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE10PushUnsafeIcEEPT_j($4,$6)|0);
 STACKTOP = sp;return ($7|0);
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE7ReserveIcEEvj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = ((($4)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $3;
 $8 = $7;
 $9 = (($6) + ($8)|0);
 $10 = ((($4)) + 16|0);
 $11 = HEAP32[$10>>2]|0;
 $12 = ($9>>>0)>($11>>>0);
 $13 = $12 ^ 1;
 $14 = $13 ^ 1;
 if (!($14)) {
  STACKTOP = sp;return;
 }
 $15 = $3;
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE6ExpandIcEEvj($4,$15);
 STACKTOP = sp;return;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE10PushUnsafeIcEEPT_j($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $5 = $2;
 $6 = ((($5)) + 12|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)!=(0|0);
 if (!($8)) {
  ___assert_fail((5127|0),(4982|0),129,(5137|0));
  // unreachable;
 }
 $9 = ((($5)) + 12|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = $3;
 $12 = $11;
 $13 = (($10) + ($12)|0);
 $14 = ((($5)) + 16|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = ($13>>>0)<=($15>>>0);
 if ($16) {
  $17 = ((($5)) + 12|0);
  $18 = HEAP32[$17>>2]|0;
  $4 = $18;
  $19 = $3;
  $20 = $19;
  $21 = ((($5)) + 12|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = (($22) + ($20)|0);
  HEAP32[$21>>2] = $23;
  $24 = $4;
  STACKTOP = sp;return ($24|0);
 } else {
  ___assert_fail((5148|0),(4982|0),130,(5137|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE6ExpandIcEEvj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $6 = $2;
 $7 = ((($6)) + 8|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)==(0|0);
 if ($9) {
  $10 = HEAP32[$6>>2]|0;
  $11 = ($10|0)!=(0|0);
  if (!($11)) {
   $12 = (__Znwj(1)|0);
   HEAP32[$6>>2] = $12;
   $13 = ((($6)) + 4|0);
   HEAP32[$13>>2] = $12;
  }
  $14 = ((($6)) + 20|0);
  $15 = HEAP32[$14>>2]|0;
  $4 = $15;
 } else {
  $16 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE11GetCapacityEv($6)|0);
  $4 = $16;
  $17 = $4;
  $18 = (($17) + 1)|0;
  $19 = (($18>>>0) / 2)&-1;
  $20 = $4;
  $21 = (($20) + ($19))|0;
  $4 = $21;
 }
 $22 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE7GetSizeEv($6)|0);
 $23 = $3;
 $24 = $23;
 $25 = (($22) + ($24))|0;
 $5 = $25;
 $26 = $4;
 $27 = $5;
 $28 = ($26>>>0)<($27>>>0);
 if (!($28)) {
  $30 = $4;
  __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE6ResizeEj($6,$30);
  STACKTOP = sp;return;
 }
 $29 = $5;
 $4 = $29;
 $30 = $4;
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE6ResizeEj($6,$30);
 STACKTOP = sp;return;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3PopIcEEPT_j($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE7GetSizeEv($4)|0);
 $6 = $3;
 $7 = $6;
 $8 = ($5>>>0)>=($7>>>0);
 if ($8) {
  $9 = $3;
  $10 = $9;
  $11 = ((($4)) + 12|0);
  $12 = HEAP32[$11>>2]|0;
  $13 = (0 - ($10))|0;
  $14 = (($12) + ($13)|0);
  HEAP32[$11>>2] = $14;
  $15 = ((($4)) + 12|0);
  $16 = HEAP32[$15>>2]|0;
  STACKTOP = sp;return ($16|0);
 } else {
  ___assert_fail((5630|0),(4982|0),138,(5661|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2EPKcjRS5_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $8 = sp;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $9 = $4;
 ;HEAP32[$9>>2]=0|0;HEAP32[$9+4>>2]=0|0;HEAP32[$9+8>>2]=0|0;HEAP32[$9+12>>2]=0|0;HEAP32[$9+16>>2]=0|0;HEAP32[$9+20>>2]=0|0;
 $10 = $5;
 $11 = $6;
 __ZN9rapidjson9StringRefIcEENS_16GenericStringRefIT_EEPKS2_j($8,$10,$11);
 $12 = $7;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE12SetStringRawENS_16GenericStringRefIcEERS5_($9,$8,$12);
 STACKTOP = sp;return;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2EPKcj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $6 = sp;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = $3;
 ;HEAP32[$7>>2]=0|0;HEAP32[$7+4>>2]=0|0;HEAP32[$7+8>>2]=0|0;HEAP32[$7+12>>2]=0|0;HEAP32[$7+16>>2]=0|0;HEAP32[$7+20>>2]=0|0;
 $8 = $4;
 $9 = $5;
 __THREW__ = 0;
 invoke_viii(110,($6|0),($8|0),($9|0));
 $10 = __THREW__; __THREW__ = 0;
 $11 = $10&1;
 if ($11) {
  $12 = ___cxa_find_matching_catch_3(0|0)|0;
  $13 = tempRet0;
  ___clang_call_terminate($12);
  // unreachable;
 } else {
  __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE12SetStringRawENS_16GenericStringRefIcEE($7,$6);
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE12SetStringRawENS_16GenericStringRefIcEERS5_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $2;
 $6 = $3;
 $5 = 0;
 $7 = ((($1)) + 4|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE11ShortString6UsableEj($8)|0);
 $10 = ((($6)) + 18|0);
 if ($9) {
  HEAP16[$10>>1] = 7173;
  $11 = ((($1)) + 4|0);
  $12 = HEAP32[$11>>2]|0;
  __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE11ShortString9SetLengthEj($6,$12);
  $5 = $6;
 } else {
  HEAP16[$10>>1] = 3077;
  $13 = ((($1)) + 4|0);
  $14 = HEAP32[$13>>2]|0;
  HEAP32[$6>>2] = $14;
  $15 = $4;
  $16 = ((($1)) + 4|0);
  $17 = HEAP32[$16>>2]|0;
  $18 = (($17) + 1)|0;
  $19 = $18;
  $20 = (__ZN9rapidjson19MemoryPoolAllocatorINS_12CrtAllocatorEE6MallocEj($15,$19)|0);
  $5 = $20;
  $21 = $5;
  (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE16SetStringPointerEPKc($6,$21)|0);
 }
 $22 = $5;
 $23 = (__ZNK9rapidjson16GenericStringRefIcEcvPKcEv($1)|0);
 $24 = ((($1)) + 4|0);
 $25 = HEAP32[$24>>2]|0;
 $26 = $25;
 _memcpy(($22|0),($23|0),($26|0))|0;
 $27 = $5;
 $28 = ((($1)) + 4|0);
 $29 = HEAP32[$28>>2]|0;
 $30 = (($27) + ($29)|0);
 HEAP8[$30>>0] = 0;
 STACKTOP = sp;return;
}
function __ZN9rapidjson9StringRefIcEENS_16GenericStringRefIT_EEPKS2_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = $4;
 __ZN9rapidjson16GenericStringRefIcEC2EPKcj($0,$5,$6);
 STACKTOP = sp;return;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE11ShortString6UsableEj($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (17)>=($2>>>0);
 STACKTOP = sp;return ($3|0);
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE11ShortString9SetLengthEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = (17 - ($5))|0;
 $7 = $6&255;
 $8 = ((($4)) + 17|0);
 HEAP8[$8>>0] = $7;
 STACKTOP = sp;return;
}
function __ZN9rapidjson19MemoryPoolAllocatorINS_12CrtAllocatorEE6MallocEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $6 = $3;
 $7 = $4;
 $8 = ($7|0)!=(0);
 if (!($8)) {
  $2 = 0;
  $44 = $2;
  STACKTOP = sp;return ($44|0);
 }
 $9 = $4;
 $10 = (_i64Add(($9|0),0,7,0)|0);
 $11 = tempRet0;
 $12 = $10 & -8;
 $4 = $12;
 $13 = HEAP32[$6>>2]|0;
 $14 = ($13|0)==(0|0);
 if ($14) {
  label = 5;
 } else {
  $15 = HEAP32[$6>>2]|0;
  $16 = ((($15)) + 4|0);
  $17 = HEAP32[$16>>2]|0;
  $18 = $4;
  $19 = (($17) + ($18))|0;
  $20 = HEAP32[$6>>2]|0;
  $21 = HEAP32[$20>>2]|0;
  $22 = ($19>>>0)>($21>>>0);
  if ($22) {
   label = 5;
  }
 }
 if ((label|0) == 5) {
  $23 = ((($6)) + 4|0);
  $24 = HEAP32[$23>>2]|0;
  $25 = $4;
  $26 = ($24>>>0)>($25>>>0);
  if ($26) {
   $27 = ((($6)) + 4|0);
   $28 = HEAP32[$27>>2]|0;
   $30 = $28;
  } else {
   $29 = $4;
   $30 = $29;
  }
  $31 = (__ZN9rapidjson19MemoryPoolAllocatorINS_12CrtAllocatorEE8AddChunkEj($6,$30)|0);
  if (!($31)) {
   $2 = 0;
   $44 = $2;
   STACKTOP = sp;return ($44|0);
  }
 }
 $32 = HEAP32[$6>>2]|0;
 $33 = ((($32)) + 16|0);
 $34 = HEAP32[$6>>2]|0;
 $35 = ((($34)) + 4|0);
 $36 = HEAP32[$35>>2]|0;
 $37 = (($33) + ($36)|0);
 $5 = $37;
 $38 = $4;
 $39 = HEAP32[$6>>2]|0;
 $40 = ((($39)) + 4|0);
 $41 = HEAP32[$40>>2]|0;
 $42 = (($41) + ($38))|0;
 HEAP32[$40>>2] = $42;
 $43 = $5;
 $2 = $43;
 $44 = $2;
 STACKTOP = sp;return ($44|0);
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE16SetStringPointerEPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = ((($4)) + 8|0);
 HEAP32[$6>>2] = $5;
 STACKTOP = sp;return ($5|0);
}
function __ZNK9rapidjson16GenericStringRefIcEcvPKcEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 STACKTOP = sp;return ($3|0);
}
function __ZN9rapidjson19MemoryPoolAllocatorINS_12CrtAllocatorEE8AddChunkEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$expand_i1_val = 0, $$expand_i1_val2 = 0, $$pre_trunc = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp + 12|0;
 $3 = $0;
 $4 = $1;
 $6 = $3;
 $7 = ((($6)) + 12|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)!=(0|0);
 if (!($9)) {
  $10 = (__Znwj(1)|0);
  $11 = ((($6)) + 12|0);
  HEAP32[$11>>2] = $10;
  $12 = ((($6)) + 16|0);
  HEAP32[$12>>2] = $10;
 }
 $13 = ((($6)) + 12|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = $4;
 $16 = (_i64Add(16,0,($15|0),0)|0);
 $17 = tempRet0;
 $18 = (__ZN9rapidjson12CrtAllocator6MallocEj($14,$16)|0);
 $5 = $18;
 $19 = $5;
 $20 = ($19|0)!=(0|0);
 if ($20) {
  $21 = $4;
  $22 = $5;
  HEAP32[$22>>2] = $21;
  $23 = $5;
  $24 = ((($23)) + 4|0);
  HEAP32[$24>>2] = 0;
  $25 = HEAP32[$6>>2]|0;
  $26 = $5;
  $27 = ((($26)) + 8|0);
  HEAP32[$27>>2] = $25;
  $28 = $5;
  HEAP32[$6>>2] = $28;
  $$expand_i1_val = 1;
  HEAP8[$2>>0] = $$expand_i1_val;
  $$pre_trunc = HEAP8[$2>>0]|0;
  $29 = $$pre_trunc&1;
  STACKTOP = sp;return ($29|0);
 } else {
  $$expand_i1_val2 = 0;
  HEAP8[$2>>0] = $$expand_i1_val2;
  $$pre_trunc = HEAP8[$2>>0]|0;
  $29 = $$pre_trunc&1;
  STACKTOP = sp;return ($29|0);
 }
 return (0)|0;
}
function __ZN9rapidjson12CrtAllocator6MallocEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $4;
 $6 = ($5|0)!=(0);
 if ($6) {
  $7 = $4;
  $8 = (_malloc($7)|0);
  $2 = $8;
 } else {
  $2 = 0;
 }
 $9 = $2;
 STACKTOP = sp;return ($9|0);
}
function __ZN9rapidjson16GenericStringRefIcEC2EPKcj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 $8 = ($7|0)!=(0|0);
 $9 = $8 ^ 1;
 $10 = $9 ^ 1;
 $11 = $4;
 $12 = $10 ? $11 : 12305;
 HEAP32[$6>>2] = $12;
 $13 = ((($6)) + 4|0);
 $14 = $5;
 HEAP32[$13>>2] = $14;
 $15 = $4;
 $16 = ($15|0)!=(0|0);
 $17 = $5;
 $18 = ($17|0)==(0);
 $or$cond = $16 | $18;
 if ($or$cond) {
  STACKTOP = sp;return;
 } else {
  ___assert_fail((5665|0),(4920|0),315,(5687|0));
  // unreachable;
 }
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE12SetStringRawENS_16GenericStringRefIcEE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $2;
 $4 = ((($3)) + 18|0);
 HEAP16[$4>>1] = 1029;
 __THREW__ = 0;
 $5 = (invoke_ii(111,($1|0))|0);
 $6 = __THREW__; __THREW__ = 0;
 $7 = $6&1;
 if (!($7)) {
  __THREW__ = 0;
  (invoke_iii(112,($3|0),($5|0))|0);
  $8 = __THREW__; __THREW__ = 0;
  $9 = $8&1;
  if (!($9)) {
   $10 = ((($1)) + 4|0);
   $11 = HEAP32[$10>>2]|0;
   HEAP32[$3>>2] = $11;
   STACKTOP = sp;return;
  }
 }
 $12 = ___cxa_find_matching_catch_3(0|0)|0;
 $13 = tempRet0;
 ___clang_call_terminate($12);
 // unreachable;
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E11StartObjectEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 32|0);
 $4 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($3,1)|0);
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2ENS_4TypeE($4,3);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E9EndObjectEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $5 = $2;
 $6 = ((($5)) + 32|0);
 $7 = $3;
 $8 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3PopINS_13GenericMemberINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($6,$7)|0);
 $4 = $8;
 $9 = ((($5)) + 32|0);
 $10 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3TopINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_v($9)|0);
 $11 = $4;
 $12 = $3;
 $13 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E12GetAllocatorEv($5)|0);
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE12SetObjectRawEPNS_13GenericMemberIS2_S5_EEjRS5_($10,$11,$12,$13);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3PopINS_13GenericMemberINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE7GetSizeEv($4)|0);
 $6 = $3;
 $7 = ($6*48)|0;
 $8 = ($5>>>0)>=($7>>>0);
 if ($8) {
  $9 = $3;
  $10 = ($9*48)|0;
  $11 = ((($4)) + 12|0);
  $12 = HEAP32[$11>>2]|0;
  $13 = (0 - ($10))|0;
  $14 = (($12) + ($13)|0);
  HEAP32[$11>>2] = $14;
  $15 = ((($4)) + 12|0);
  $16 = HEAP32[$15>>2]|0;
  STACKTOP = sp;return ($16|0);
 } else {
  ___assert_fail((5630|0),(4982|0),138,(5661|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3TopINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_v($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE7GetSizeEv($2)|0);
 $4 = ($3>>>0)>=(24);
 if ($4) {
  $5 = ((($2)) + 12|0);
  $6 = HEAP32[$5>>2]|0;
  $7 = ((($6)) + -24|0);
  STACKTOP = sp;return ($7|0);
 } else {
  ___assert_fail((5733|0),(4982|0),145,(5756|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE12SetObjectRawEPNS_13GenericMemberIS2_S5_EEjRS5_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $9 = $4;
 $10 = ((($9)) + 18|0);
 HEAP16[$10>>1] = 3;
 $11 = $6;
 $12 = ($11|0)!=(0);
 if ($12) {
  $13 = $7;
  $14 = $6;
  $15 = ($14*48)|0;
  $16 = (__ZN9rapidjson19MemoryPoolAllocatorINS_12CrtAllocatorEE6MallocEj($13,$15)|0);
  $8 = $16;
  $17 = $8;
  (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE17SetMembersPointerEPNS_13GenericMemberIS2_S5_EE($9,$17)|0);
  $18 = $8;
  $19 = $5;
  $20 = $6;
  $21 = ($20*48)|0;
  _memcpy(($18|0),($19|0),($21|0))|0;
  $22 = $6;
  $23 = ((($9)) + 4|0);
  HEAP32[$23>>2] = $22;
  HEAP32[$9>>2] = $22;
  STACKTOP = sp;return;
 } else {
  (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE17SetMembersPointerEPNS_13GenericMemberIS2_S5_EE($9,0)|0);
  $22 = $6;
  $23 = ((($9)) + 4|0);
  HEAP32[$23>>2] = $22;
  HEAP32[$9>>2] = $22;
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE17SetMembersPointerEPNS_13GenericMemberIS2_S5_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = ((($4)) + 8|0);
 HEAP32[$6>>2] = $5;
 STACKTOP = sp;return ($5|0);
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E10StartArrayEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 32|0);
 $4 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($3,1)|0);
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2ENS_4TypeE($4,4);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E8EndArrayEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $5 = $2;
 $6 = ((($5)) + 32|0);
 $7 = $3;
 $8 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3PopINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($6,$7)|0);
 $4 = $8;
 $9 = ((($5)) + 32|0);
 $10 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3TopINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_v($9)|0);
 $11 = $4;
 $12 = $3;
 $13 = (__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E12GetAllocatorEv($5)|0);
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE11SetArrayRawEPS6_jRS5_($10,$11,$12,$13);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE11SetArrayRawEPS6_jRS5_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $9 = $4;
 $10 = ((($9)) + 18|0);
 HEAP16[$10>>1] = 4;
 $11 = $6;
 $12 = ($11|0)!=(0);
 if ($12) {
  $13 = $7;
  $14 = $6;
  $15 = ($14*24)|0;
  $16 = (__ZN9rapidjson19MemoryPoolAllocatorINS_12CrtAllocatorEE6MallocEj($13,$15)|0);
  $8 = $16;
  $17 = $8;
  (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE18SetElementsPointerEPS6_($9,$17)|0);
  $18 = $8;
  $19 = $5;
  $20 = $6;
  $21 = ($20*24)|0;
  _memcpy(($18|0),($19|0),($21|0))|0;
  $22 = $6;
  $23 = ((($9)) + 4|0);
  HEAP32[$23>>2] = $22;
  HEAP32[$9>>2] = $22;
  STACKTOP = sp;return;
 } else {
  (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE18SetElementsPointerEPS6_($9,0)|0);
  $22 = $6;
  $23 = ((($9)) + 4|0);
  HEAP32[$23>>2] = $22;
  HEAP32[$9>>2] = $22;
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE18SetElementsPointerEPS6_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = ((($4)) + 8|0);
 HEAP32[$6>>2] = $5;
 STACKTOP = sp;return ($5|0);
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EEC2ERS4_RS7_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $5;
 HEAP32[$6>>2] = $7;
 STACKTOP = sp;return;
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EE4TellEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($3)|0);
 STACKTOP = sp;return ($4|0);
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS4_12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EEEEEbRT_NSA_2ChE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$expand_i1_val = 0, $$expand_i1_val2 = 0, $$pre_trunc = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp + 5|0;
 $3 = $0;
 $4 = $1;
 $5 = $3;
 $6 = (__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EE4PeekEv($5)|0);
 $7 = $6 << 24 >> 24;
 $8 = $4;
 $9 = $8 << 24 >> 24;
 $10 = ($7|0)==($9|0);
 $11 = $10 ^ 1;
 $12 = $11 ^ 1;
 if ($12) {
  $13 = $3;
  (__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EE4TakeEv($13)|0);
  $$expand_i1_val = 1;
  HEAP8[$2>>0] = $$expand_i1_val;
  $$pre_trunc = HEAP8[$2>>0]|0;
  $14 = $$pre_trunc&1;
  STACKTOP = sp;return ($14|0);
 } else {
  $$expand_i1_val2 = 0;
  HEAP8[$2>>0] = $$expand_i1_val2;
  $$pre_trunc = HEAP8[$2>>0]|0;
  $14 = $$pre_trunc&1;
  STACKTOP = sp;return ($14|0);
 }
 return (0)|0;
}
function __ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EE4PeekEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4PeekEv($3)|0);
 STACKTOP = sp;return ($4|0);
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EE8TakePushEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($3)|0);
 STACKTOP = sp;return ($4|0);
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EE6LengthEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 0;
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EE4TakeEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($3)|0);
 STACKTOP = sp;return ($4|0);
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EE3PopEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return (0|0);
}
function __ZN9rapidjson8internal21StrtodNormalPrecisionEdi($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $10 = 0, $11 = 0.0, $12 = 0, $13 = 0.0, $14 = 0.0, $2 = 0.0, $3 = 0, $4 = 0, $5 = 0, $6 = 0.0, $7 = 0.0, $8 = 0.0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = ($4|0)<(-308);
 $6 = $2;
 if ($5) {
  $7 = (+__ZN9rapidjson8internal8FastPathEdi($6,-308));
  $2 = $7;
  $8 = $2;
  $9 = $3;
  $10 = (($9) + 308)|0;
  $11 = (+__ZN9rapidjson8internal8FastPathEdi($8,$10));
  $2 = $11;
  $14 = $2;
  STACKTOP = sp;return (+$14);
 } else {
  $12 = $3;
  $13 = (+__ZN9rapidjson8internal8FastPathEdi($6,$12));
  $2 = $13;
  $14 = $2;
  STACKTOP = sp;return (+$14);
 }
 return +(0.0);
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E6DoubleEd($0,$1) {
 $0 = $0|0;
 $1 = +$1;
 var $2 = 0, $3 = 0.0, $4 = 0, $5 = 0, $6 = 0, $7 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = ((($4)) + 32|0);
 $6 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($5,1)|0);
 $7 = $3;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2Ed($6,$7);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E5Int64Ex($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = sp;
 $3 = $0;
 $5 = $4;
 $6 = $5;
 HEAP32[$6>>2] = $1;
 $7 = (($5) + 4)|0;
 $8 = $7;
 HEAP32[$8>>2] = $2;
 $9 = $3;
 $10 = ((($9)) + 32|0);
 $11 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($10,1)|0);
 $12 = $4;
 $13 = $12;
 $14 = HEAP32[$13>>2]|0;
 $15 = (($12) + 4)|0;
 $16 = $15;
 $17 = HEAP32[$16>>2]|0;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2Ex($11,$14,$17);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E6Uint64Ey($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = sp;
 $3 = $0;
 $5 = $4;
 $6 = $5;
 HEAP32[$6>>2] = $1;
 $7 = (($5) + 4)|0;
 $8 = $7;
 HEAP32[$8>>2] = $2;
 $9 = $3;
 $10 = ((($9)) + 32|0);
 $11 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($10,1)|0);
 $12 = $4;
 $13 = $12;
 $14 = HEAP32[$13>>2]|0;
 $15 = (($12) + 4)|0;
 $16 = $15;
 $17 = HEAP32[$16>>2]|0;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2Ey($11,$14,$17);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E3IntEi($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = ((($4)) + 32|0);
 $6 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($5,1)|0);
 $7 = $3;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2Ei($6,$7);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E4UintEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = ((($4)) + 32|0);
 $6 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j($5,1)|0);
 $7 = $3;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2Ej($6,$7);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson8internal8FastPathEdi($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $10 = 0, $11 = 0.0, $12 = 0.0, $13 = 0, $14 = 0.0, $15 = 0.0, $16 = 0.0, $2 = 0.0, $3 = 0.0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $3 = $0;
 $4 = $1;
 $5 = $4;
 $6 = ($5|0)<(-308);
 do {
  if ($6) {
   $2 = 0.0;
  } else {
   $7 = $4;
   $8 = ($7|0)>=(0);
   $9 = $3;
   $10 = $4;
   if ($8) {
    $11 = (+__ZN9rapidjson8internal5Pow10Ei($10));
    $12 = $9 * $11;
    $2 = $12;
    break;
   } else {
    $13 = (0 - ($10))|0;
    $14 = (+__ZN9rapidjson8internal5Pow10Ei($13));
    $15 = $9 / $14;
    $2 = $15;
    break;
   }
  }
 } while(0);
 $16 = $2;
 STACKTOP = sp;return (+$16);
}
function __ZN9rapidjson8internal5Pow10Ei($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ($2|0)>=(0);
 $4 = $1;
 $5 = ($4|0)<=(308);
 $or$cond = $3 & $5;
 if ($or$cond) {
  $6 = $1;
  $7 = (8 + ($6<<3)|0);
  $8 = +HEAPF64[$7>>3];
  STACKTOP = sp;return (+$8);
 } else {
  ___assert_fail((5800|0),(5819|0),48,(5864|0));
  // unreachable;
 }
 return +(0.0);
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2Ed($0,$1) {
 $0 = $0|0;
 $1 = +$1;
 var $2 = 0, $3 = 0.0, $4 = 0, $5 = 0.0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 ;HEAP32[$4>>2]=0|0;HEAP32[$4+4>>2]=0|0;HEAP32[$4+8>>2]=0|0;HEAP32[$4+12>>2]=0|0;HEAP32[$4+16>>2]=0|0;HEAP32[$4+20>>2]=0|0;
 $5 = $3;
 HEAPF64[$4>>3] = $5;
 $6 = ((($4)) + 18|0);
 HEAP16[$6>>1] = 534;
 STACKTOP = sp;return;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2Ex($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = sp;
 $3 = $0;
 $5 = $4;
 $6 = $5;
 HEAP32[$6>>2] = $1;
 $7 = (($5) + 4)|0;
 $8 = $7;
 HEAP32[$8>>2] = $2;
 $9 = $3;
 ;HEAP32[$9>>2]=0|0;HEAP32[$9+4>>2]=0|0;HEAP32[$9+8>>2]=0|0;HEAP32[$9+12>>2]=0|0;HEAP32[$9+16>>2]=0|0;HEAP32[$9+20>>2]=0|0;
 $10 = $4;
 $11 = $10;
 $12 = HEAP32[$11>>2]|0;
 $13 = (($10) + 4)|0;
 $14 = $13;
 $15 = HEAP32[$14>>2]|0;
 $16 = $9;
 $17 = $16;
 HEAP32[$17>>2] = $12;
 $18 = (($16) + 4)|0;
 $19 = $18;
 HEAP32[$19>>2] = $15;
 $20 = ((($9)) + 18|0);
 HEAP16[$20>>1] = 150;
 $21 = $4;
 $22 = $21;
 $23 = HEAP32[$22>>2]|0;
 $24 = (($21) + 4)|0;
 $25 = $24;
 $26 = HEAP32[$25>>2]|0;
 $27 = ($26|0)>(0);
 $28 = ($23>>>0)>=(0);
 $29 = ($26|0)==(0);
 $30 = $29 & $28;
 $31 = $27 | $30;
 if (!($31)) {
  $66 = $4;
  $67 = $66;
  $68 = HEAP32[$67>>2]|0;
  $69 = (($66) + 4)|0;
  $70 = $69;
  $71 = HEAP32[$70>>2]|0;
  $72 = ($71|0)>(-1);
  $73 = ($68>>>0)>=(2147483648);
  $74 = ($71|0)==(-1);
  $75 = $74 & $73;
  $76 = $72 | $75;
  if (!($76)) {
   STACKTOP = sp;return;
  }
  $77 = ((($9)) + 18|0);
  $78 = HEAP16[$77>>1]|0;
  $79 = $78&65535;
  $80 = $79 | 32;
  $81 = $80&65535;
  HEAP16[$77>>1] = $81;
  STACKTOP = sp;return;
 }
 $32 = ((($9)) + 18|0);
 $33 = HEAP16[$32>>1]|0;
 $34 = $33&65535;
 $35 = $34 | 278;
 $36 = $35&65535;
 HEAP16[$32>>1] = $36;
 $37 = $4;
 $38 = $37;
 $39 = HEAP32[$38>>2]|0;
 $40 = (($37) + 4)|0;
 $41 = $40;
 $42 = HEAP32[$41>>2]|0;
 $43 = (0)!=(0);
 $44 = ($42|0)!=(0);
 $45 = $43 | $44;
 if (!($45)) {
  $46 = ((($9)) + 18|0);
  $47 = HEAP16[$46>>1]|0;
  $48 = $47&65535;
  $49 = $48 | 64;
  $50 = $49&65535;
  HEAP16[$46>>1] = $50;
 }
 $51 = $4;
 $52 = $51;
 $53 = HEAP32[$52>>2]|0;
 $54 = (($51) + 4)|0;
 $55 = $54;
 $56 = HEAP32[$55>>2]|0;
 $57 = $53 & -2147483648;
 $58 = ($57|0)!=(0);
 $59 = ($56|0)!=(0);
 $60 = $58 | $59;
 if ($60) {
  STACKTOP = sp;return;
 }
 $61 = ((($9)) + 18|0);
 $62 = HEAP16[$61>>1]|0;
 $63 = $62&65535;
 $64 = $63 | 32;
 $65 = $64&65535;
 HEAP16[$61>>1] = $65;
 STACKTOP = sp;return;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2Ey($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = sp;
 $3 = $0;
 $5 = $4;
 $6 = $5;
 HEAP32[$6>>2] = $1;
 $7 = (($5) + 4)|0;
 $8 = $7;
 HEAP32[$8>>2] = $2;
 $9 = $3;
 ;HEAP32[$9>>2]=0|0;HEAP32[$9+4>>2]=0|0;HEAP32[$9+8>>2]=0|0;HEAP32[$9+12>>2]=0|0;HEAP32[$9+16>>2]=0|0;HEAP32[$9+20>>2]=0|0;
 $10 = $4;
 $11 = $10;
 $12 = HEAP32[$11>>2]|0;
 $13 = (($10) + 4)|0;
 $14 = $13;
 $15 = HEAP32[$14>>2]|0;
 $16 = $9;
 $17 = $16;
 HEAP32[$17>>2] = $12;
 $18 = (($16) + 4)|0;
 $19 = $18;
 HEAP32[$19>>2] = $15;
 $20 = ((($9)) + 18|0);
 HEAP16[$20>>1] = 278;
 $21 = $4;
 $22 = $21;
 $23 = HEAP32[$22>>2]|0;
 $24 = (($21) + 4)|0;
 $25 = $24;
 $26 = HEAP32[$25>>2]|0;
 $27 = $26 & -2147483648;
 $28 = (0)!=(0);
 $29 = ($27|0)!=(0);
 $30 = $28 | $29;
 if (!($30)) {
  $31 = ((($9)) + 18|0);
  $32 = HEAP16[$31>>1]|0;
  $33 = $32&65535;
  $34 = $33 | 128;
  $35 = $34&65535;
  HEAP16[$31>>1] = $35;
 }
 $36 = $4;
 $37 = $36;
 $38 = HEAP32[$37>>2]|0;
 $39 = (($36) + 4)|0;
 $40 = $39;
 $41 = HEAP32[$40>>2]|0;
 $42 = (0)!=(0);
 $43 = ($41|0)!=(0);
 $44 = $42 | $43;
 if (!($44)) {
  $45 = ((($9)) + 18|0);
  $46 = HEAP16[$45>>1]|0;
  $47 = $46&65535;
  $48 = $47 | 64;
  $49 = $48&65535;
  HEAP16[$45>>1] = $49;
 }
 $50 = $4;
 $51 = $50;
 $52 = HEAP32[$51>>2]|0;
 $53 = (($50) + 4)|0;
 $54 = $53;
 $55 = HEAP32[$54>>2]|0;
 $56 = $52 & -2147483648;
 $57 = ($56|0)!=(0);
 $58 = ($55|0)!=(0);
 $59 = $57 | $58;
 if ($59) {
  STACKTOP = sp;return;
 }
 $60 = ((($9)) + 18|0);
 $61 = HEAP16[$60>>1]|0;
 $62 = $61&65535;
 $63 = $62 | 32;
 $64 = $63&65535;
 HEAP16[$60>>1] = $64;
 STACKTOP = sp;return;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2Ei($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 ;HEAP32[$4>>2]=0|0;HEAP32[$4+4>>2]=0|0;HEAP32[$4+8>>2]=0|0;HEAP32[$4+12>>2]=0|0;HEAP32[$4+16>>2]=0|0;HEAP32[$4+20>>2]=0|0;
 $5 = $3;
 $6 = ($5|0)<(0);
 $7 = $6 << 31 >> 31;
 $8 = $4;
 $9 = $8;
 HEAP32[$9>>2] = $5;
 $10 = (($8) + 4)|0;
 $11 = $10;
 HEAP32[$11>>2] = $7;
 $12 = $3;
 $13 = ($12|0)>=(0);
 $14 = $13 ? 502 : 182;
 $15 = $14&65535;
 $16 = ((($4)) + 18|0);
 HEAP16[$16>>1] = $15;
 STACKTOP = sp;return;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2Ej($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 ;HEAP32[$4>>2]=0|0;HEAP32[$4+4>>2]=0|0;HEAP32[$4+8>>2]=0|0;HEAP32[$4+12>>2]=0|0;HEAP32[$4+16>>2]=0|0;HEAP32[$4+20>>2]=0|0;
 $5 = $3;
 $6 = $4;
 $7 = $6;
 HEAP32[$7>>2] = $5;
 $8 = (($6) + 4)|0;
 $9 = $8;
 HEAP32[$9>>2] = 0;
 $10 = $3;
 $11 = $10 & -2147483648;
 $12 = ($11|0)!=(0);
 $13 = $12 ? 470 : 502;
 $14 = $13&65535;
 $15 = ((($4)) + 18|0);
 HEAP16[$15>>1] = $14;
 STACKTOP = sp;return;
}
function __ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE10ClearStackEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE5ClearEv($2);
 STACKTOP = sp;return;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE5ClearEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($2)) + 12|0);
 HEAP32[$5>>2] = $4;
 STACKTOP = sp;return;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9RawAssignERS6_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 ;HEAP32[$4>>2]=HEAP32[$5>>2]|0;HEAP32[$4+4>>2]=HEAP32[$5+4>>2]|0;HEAP32[$4+8>>2]=HEAP32[$5+8>>2]|0;HEAP32[$4+12>>2]=HEAP32[$5+12>>2]|0;HEAP32[$4+16>>2]=HEAP32[$5+16>>2]|0;HEAP32[$4+20>>2]=HEAP32[$5+20>>2]|0;
 $6 = $3;
 $7 = ((($6)) + 18|0);
 HEAP16[$7>>1] = 0;
 STACKTOP = sp;return;
}
function __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E10ClearStackEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 32|0);
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE5ClearEv($3);
 $4 = ((($2)) + 32|0);
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE11ShrinkToFitEv($4);
 STACKTOP = sp;return;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE11ShrinkToFitEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE5EmptyEv($2)|0);
 if ($3) {
  $4 = ((($2)) + 8|0);
  $5 = HEAP32[$4>>2]|0;
  __ZN9rapidjson12CrtAllocator4FreeEPv($5);
  $6 = ((($2)) + 8|0);
  HEAP32[$6>>2] = 0;
  $7 = ((($2)) + 12|0);
  HEAP32[$7>>2] = 0;
  $8 = ((($2)) + 16|0);
  HEAP32[$8>>2] = 0;
  STACKTOP = sp;return;
 } else {
  $9 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE7GetSizeEv($2)|0);
  __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE6ResizeEj($2,$9);
  STACKTOP = sp;return;
 }
}
function __ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE5EmptyEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 12|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($2)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($4|0)==($6|0);
 STACKTOP = sp;return ($7|0);
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE10FindMemberEPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp + 12|0;
 $5 = sp;
 $3 = $0;
 $4 = $1;
 $6 = $3;
 $7 = $4;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE10FindMemberEPKc($5,$6,$7);
 __ZN9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2ERKNS0_ILb0ES2_S5_EE($2,$5);
 $8 = HEAP32[$2>>2]|0;
 STACKTOP = sp;return ($8|0);
}
function __ZNK9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEneES6_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $2;
 $4 = HEAP32[$3>>2]|0;
 $5 = HEAP32[$1>>2]|0;
 $6 = ($4|0)!=($5|0);
 STACKTOP = sp;return ($6|0);
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9MemberEndEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp + 4|0;
 $2 = $0;
 $3 = $2;
 $4 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsObjectEv($3)|0);
 if ($4) {
  $5 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE17GetMembersPointerEv($3)|0);
  $6 = HEAP32[$3>>2]|0;
  $7 = (($5) + (($6*48)|0)|0);
  __ZN9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2EPKNS_13GenericMemberIS2_S5_EE($1,$7);
  $8 = HEAP32[$1>>2]|0;
  STACKTOP = sp;return ($8|0);
 } else {
  ___assert_fail((5916|0),(4920|0),1136,(5966|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE10FindMemberEPKc($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $5 = sp;
 $6 = sp + 32|0;
 $3 = $1;
 $4 = $2;
 $9 = $3;
 $10 = $4;
 __ZN9rapidjson9StringRefIcEENS_16GenericStringRefIT_EEPKS2_($6,$10);
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2ENS_16GenericStringRefIcEE($5,$6);
 __THREW__ = 0;
 invoke_viii(113,($0|0),($9|0),($5|0));
 $11 = __THREW__; __THREW__ = 0;
 $12 = $11&1;
 if ($12) {
  $13 = ___cxa_find_matching_catch_2()|0;
  $14 = tempRet0;
  $7 = $13;
  $8 = $14;
  __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($5);
  $15 = $7;
  $16 = $8;
  ___resumeException($15|0);
  // unreachable;
 } else {
  __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($5);
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2ERKNS0_ILb0ES2_S5_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = HEAP32[$5>>2]|0;
 HEAP32[$4>>2] = $6;
 STACKTOP = sp;return;
}
function __ZN9rapidjson9StringRefIcEENS_16GenericStringRefIT_EEPKS2_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $1;
 $3 = $2;
 __ZN9rapidjson16GenericStringRefIcEC2EPKc($0,$3);
 STACKTOP = sp;return;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2ENS_16GenericStringRefIcEE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = sp;
 $2 = $0;
 $4 = $2;
 ;HEAP32[$4>>2]=0|0;HEAP32[$4+4>>2]=0|0;HEAP32[$4+8>>2]=0|0;HEAP32[$4+12>>2]=0|0;HEAP32[$4+16>>2]=0|0;HEAP32[$4+20>>2]=0|0;
 __THREW__ = 0;
 invoke_vii(114,($3|0),($1|0));
 $5 = __THREW__; __THREW__ = 0;
 $6 = $5&1;
 if ($6) {
  $7 = ___cxa_find_matching_catch_3(0|0)|0;
  $8 = tempRet0;
  ___clang_call_terminate($7);
  // unreachable;
 } else {
  __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE12SetStringRawENS_16GenericStringRefIcEE($4,$3);
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE10FindMemberIS5_EENS_21GenericMemberIteratorILb0ES2_S5_EERKNS0_IS2_T_EE($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $$byval_copy = sp + 16|0;
 $5 = sp + 4|0;
 $6 = sp;
 $3 = $1;
 $4 = $2;
 $7 = $3;
 $8 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsObjectEv($7)|0);
 if (!($8)) {
  ___assert_fail((5916|0),(4920|0),1227,(5927|0));
  // unreachable;
 }
 $9 = $4;
 $10 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsStringEv($9)|0);
 if (!($10)) {
  ___assert_fail((5938|0),(4920|0),1228,(5927|0));
  // unreachable;
 }
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE11MemberBeginEv($0,$7);
 while(1) {
  __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9MemberEndEv($6,$7);
  __ZN9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2ERKNS0_ILb0ES2_S5_EE($5,$6);
  ;HEAP32[$$byval_copy>>2]=HEAP32[$5>>2]|0;
  $11 = (__ZNK9rapidjson21GenericMemberIteratorILb0ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEneENS0_ILb1ES2_S5_EE($0,$$byval_copy)|0);
  if (!($11)) {
   label = 9;
   break;
  }
  $12 = $4;
  $13 = (__ZNK9rapidjson21GenericMemberIteratorILb0ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEptEv($0)|0);
  $14 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE11StringEqualIS5_EEbRKNS0_IS2_T_EE($12,$13)|0);
  if ($14) {
   label = 9;
   break;
  }
  (__ZN9rapidjson21GenericMemberIteratorILb0ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEppEv($0)|0);
 }
 if ((label|0) == 9) {
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson16GenericStringRefIcEC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 HEAP32[$4>>2] = $5;
 $6 = ((($4)) + 4|0);
 $7 = $3;
 $8 = (__ZN9rapidjson16GenericStringRefIcE13NotNullStrLenEPKc($4,$7)|0);
 HEAP32[$6>>2] = $8;
 STACKTOP = sp;return;
}
function __ZN9rapidjson16GenericStringRefIcE13NotNullStrLenEPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = ($4|0)!=(0|0);
 if ($5) {
  $6 = $3;
  $7 = (__ZN9rapidjson8internal6StrLenIcEEjPKT_($6)|0);
  STACKTOP = sp;return ($7|0);
 } else {
  ___assert_fail((5893|0),(4920|0),327,(5902|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN9rapidjson8internal6StrLenIcEEjPKT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (_strlen($2)|0);
 STACKTOP = sp;return ($3|0);
}
function __ZN9rapidjson16GenericStringRefIcEC2ERKS1_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = HEAP32[$5>>2]|0;
 HEAP32[$4>>2] = $6;
 $7 = ((($4)) + 4|0);
 $8 = $3;
 $9 = ((($8)) + 4|0);
 $10 = HEAP32[$9>>2]|0;
 HEAP32[$7>>2] = $10;
 STACKTOP = sp;return;
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsObjectEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 18|0);
 $4 = HEAP16[$3>>1]|0;
 $5 = $4&65535;
 $6 = ($5|0)==(3);
 STACKTOP = sp;return ($6|0);
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsStringEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 18|0);
 $4 = HEAP16[$3>>1]|0;
 $5 = $4&65535;
 $6 = $5 & 1024;
 $7 = ($6|0)!=(0);
 STACKTOP = sp;return ($7|0);
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE11MemberBeginEv($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $1;
 $3 = $2;
 $4 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsObjectEv($3)|0);
 if ($4) {
  $5 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE17GetMembersPointerEv($3)|0);
  __ZN9rapidjson21GenericMemberIteratorILb0ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2EPNS_13GenericMemberIS2_S5_EE($0,$5);
  STACKTOP = sp;return;
 } else {
  ___assert_fail((5916|0),(4920|0),1139,(5954|0));
  // unreachable;
 }
}
function __ZNK9rapidjson21GenericMemberIteratorILb0ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEneENS0_ILb1ES2_S5_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $2;
 $4 = HEAP32[$3>>2]|0;
 $5 = HEAP32[$1>>2]|0;
 $6 = ($4|0)!=($5|0);
 STACKTOP = sp;return ($6|0);
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9MemberEndEv($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $1;
 $3 = $2;
 $4 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsObjectEv($3)|0);
 if ($4) {
  $5 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE17GetMembersPointerEv($3)|0);
  $6 = HEAP32[$3>>2]|0;
  $7 = (($5) + (($6*48)|0)|0);
  __ZN9rapidjson21GenericMemberIteratorILb0ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2EPNS_13GenericMemberIS2_S5_EE($0,$7);
  STACKTOP = sp;return;
 } else {
  ___assert_fail((5916|0),(4920|0),1142,(5966|0));
  // unreachable;
 }
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE11StringEqualIS5_EEbRKNS0_IS2_T_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$expand_i1_val = 0, $$expand_i1_val2 = 0, $$expand_i1_val4 = 0, $$pre_trunc = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $2 = sp + 24|0;
 $3 = $0;
 $4 = $1;
 $9 = $3;
 $10 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsStringEv($9)|0);
 if (!($10)) {
  ___assert_fail((5976|0),(4920|0),2064,(5987|0));
  // unreachable;
 }
 $11 = $4;
 $12 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsStringEv($11)|0);
 if (!($12)) {
  ___assert_fail((5999|0),(4920|0),2065,(5987|0));
  // unreachable;
 }
 $13 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE15GetStringLengthEv($9)|0);
 $5 = $13;
 $14 = $4;
 $15 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE15GetStringLengthEv($14)|0);
 $6 = $15;
 $16 = $5;
 $17 = $6;
 $18 = ($16|0)!=($17|0);
 if ($18) {
  $$expand_i1_val = 0;
  HEAP8[$2>>0] = $$expand_i1_val;
  $$pre_trunc = HEAP8[$2>>0]|0;
  $31 = $$pre_trunc&1;
  STACKTOP = sp;return ($31|0);
 }
 $19 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9GetStringEv($9)|0);
 $7 = $19;
 $20 = $4;
 $21 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9GetStringEv($20)|0);
 $8 = $21;
 $22 = $7;
 $23 = $8;
 $24 = ($22|0)==($23|0);
 if ($24) {
  $$expand_i1_val2 = 1;
  HEAP8[$2>>0] = $$expand_i1_val2;
  $$pre_trunc = HEAP8[$2>>0]|0;
  $31 = $$pre_trunc&1;
  STACKTOP = sp;return ($31|0);
 } else {
  $25 = $7;
  $26 = $8;
  $27 = $5;
  $28 = $27;
  $29 = (_memcmp($25,$26,$28)|0);
  $30 = ($29|0)==(0);
  $$expand_i1_val4 = $30&1;
  HEAP8[$2>>0] = $$expand_i1_val4;
  $$pre_trunc = HEAP8[$2>>0]|0;
  $31 = $$pre_trunc&1;
  STACKTOP = sp;return ($31|0);
 }
 return (0)|0;
}
function __ZNK9rapidjson21GenericMemberIteratorILb0ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEptEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 STACKTOP = sp;return ($3|0);
}
function __ZN9rapidjson21GenericMemberIteratorILb0ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEppEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = ((($3)) + 48|0);
 HEAP32[$2>>2] = $4;
 STACKTOP = sp;return ($2|0);
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE17GetMembersPointerEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 STACKTOP = sp;return ($4|0);
}
function __ZN9rapidjson21GenericMemberIteratorILb0ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2EPNS_13GenericMemberIS2_S5_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 HEAP32[$4>>2] = $5;
 STACKTOP = sp;return;
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE15GetStringLengthEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsStringEv($2)|0);
 if (!($3)) {
  ___assert_fail((5976|0),(4920|0),1750,(6014|0));
  // unreachable;
 }
 $4 = ((($2)) + 18|0);
 $5 = HEAP16[$4>>1]|0;
 $6 = $5&65535;
 $7 = $6 & 4096;
 $8 = ($7|0)!=(0);
 if ($8) {
  $9 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE11ShortString9GetLengthEv($2)|0);
  $11 = $9;
  STACKTOP = sp;return ($11|0);
 } else {
  $10 = HEAP32[$2>>2]|0;
  $11 = $10;
  STACKTOP = sp;return ($11|0);
 }
 return (0)|0;
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE11ShortString9GetLengthEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 17|0);
 $4 = HEAP8[$3>>0]|0;
 $5 = $4 << 24 >> 24;
 $6 = (17 - ($5))|0;
 STACKTOP = sp;return ($6|0);
}
function __ZN9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2EPKNS_13GenericMemberIS2_S5_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 HEAP32[$4>>2] = $5;
 STACKTOP = sp;return;
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEixIS5_EERS6_RKNS0_IS2_T_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$byval_copy = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $$byval_copy = sp + 20|0;
 $4 = sp + 8|0;
 $5 = sp + 4|0;
 $6 = sp;
 $2 = $0;
 $3 = $1;
 $7 = $2;
 $8 = $3;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE10FindMemberIS5_EENS_21GenericMemberIteratorILb0ES2_S5_EERKNS0_IS2_T_EE($4,$7,$8);
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9MemberEndEv($6,$7);
 __ZN9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2ERKNS0_ILb0ES2_S5_EE($5,$6);
 ;HEAP32[$$byval_copy>>2]=HEAP32[$5>>2]|0;
 $9 = (__ZNK9rapidjson21GenericMemberIteratorILb0ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEneENS0_ILb1ES2_S5_EE($4,$$byval_copy)|0);
 if ($9) {
  $10 = (__ZNK9rapidjson21GenericMemberIteratorILb0ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEptEv($4)|0);
  $11 = ((($10)) + 24|0);
  STACKTOP = sp;return ($11|0);
 } else {
  ___assert_fail((6030|0),(4920|0),1111,(6036|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE16GetStringPointerEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 STACKTOP = sp;return ($4|0);
}
function __ZNSt3__211char_traitsIcE6lengthEPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (_strlen($2)|0);
 STACKTOP = sp;return ($3|0);
}
function __ZNSt3__211char_traitsIcE4copyEPcPKcj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $5;
 $7 = ($6|0)==(0);
 $8 = $3;
 if ($7) {
  STACKTOP = sp;return ($8|0);
 }
 $9 = $4;
 $10 = $5;
 _memcpy(($8|0),($9|0),($10|0))|0;
 STACKTOP = sp;return ($8|0);
}
function __ZNSt3__211char_traitsIcE6assignERcRKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = HEAP8[$4>>0]|0;
 $6 = $2;
 HEAP8[$6>>0] = $5;
 STACKTOP = sp;return;
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE7IsArrayEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 18|0);
 $4 = HEAP16[$3>>1]|0;
 $5 = $4&65535;
 $6 = ($5|0)==(4);
 STACKTOP = sp;return ($6|0);
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE18GetElementsPointerEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 STACKTOP = sp;return ($4|0);
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE7GetTypeEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 18|0);
 $4 = HEAP16[$3>>1]|0;
 $5 = $4&65535;
 $6 = $5 & 7;
 STACKTOP = sp;return ($6|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE4NullEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6PrefixENS_4TypeE($2,0);
 $3 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE9WriteNullEv($2)|0);
 $4 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE8EndValueEb($2,$3)|0);
 STACKTOP = sp;return ($4|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE4BoolEb($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $4 = $1&1;
 $3 = $4;
 $5 = $2;
 $6 = $3;
 $7 = $6&1;
 $8 = $7 ? 2 : 1;
 __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6PrefixENS_4TypeE($5,$8);
 $9 = $3;
 $10 = $9&1;
 $11 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE9WriteBoolEb($5,$10)|0);
 $12 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE8EndValueEb($5,$11)|0);
 STACKTOP = sp;return ($12|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE11StartObjectEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6PrefixENS_4TypeE($2,3);
 $3 = ((($2)) + 4|0);
 $4 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEPT_j($3,1)|0);
 __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE5LevelC2Eb($4,0);
 $5 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE16WriteStartObjectEv($2)|0);
 STACKTOP = sp;return ($5|0);
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE11MemberBeginEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp + 4|0;
 $2 = $0;
 $3 = $2;
 $4 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsObjectEv($3)|0);
 if ($4) {
  $5 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE17GetMembersPointerEv($3)|0);
  __ZN9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEC2EPKNS_13GenericMemberIS2_S5_EE($1,$5);
  $6 = HEAP32[$1>>2]|0;
  STACKTOP = sp;return ($6|0);
 } else {
  ___assert_fail((5916|0),(4920|0),1133,(5954|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZNK9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEptEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 STACKTOP = sp;return ($3|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE3KeyEPKcjb($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $8 = $3&1;
 $7 = $8;
 $9 = $4;
 $10 = $5;
 $11 = $6;
 $12 = $7;
 $13 = $12&1;
 $14 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6StringEPKcjb($9,$10,$11,$13)|0);
 STACKTOP = sp;return ($14|0);
}
function __ZN9rapidjson21GenericMemberIteratorILb1ENS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEppEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = ((($3)) + 48|0);
 HEAP32[$2>>2] = $4;
 STACKTOP = sp;return ($2|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE9EndObjectEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = ((($4)) + 4|0);
 $6 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE7GetSizeEv($5)|0);
 $7 = ($6>>>0)>=(8);
 if (!($7)) {
  ___assert_fail((6234|0),(6180|0),234,(6274|0));
  // unreachable;
 }
 $8 = ((($4)) + 4|0);
 $9 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3TopINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEPT_v($8)|0);
 $10 = ((($9)) + 4|0);
 $11 = HEAP8[$10>>0]|0;
 $12 = $11&1;
 if ($12) {
  ___assert_fail((6284|0),(6180|0),235,(6274|0));
  // unreachable;
 }
 $13 = ((($4)) + 4|0);
 $14 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3TopINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEPT_v($13)|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = (($15>>>0) % 2)&-1;
 $17 = (0)==($16|0);
 if ($17) {
  $18 = ((($4)) + 4|0);
  (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3PopINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEPT_j($18,1)|0);
  $19 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE14WriteEndObjectEv($4)|0);
  $20 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE8EndValueEb($4,$19)|0);
  STACKTOP = sp;return ($20|0);
 } else {
  ___assert_fail((6329|0),(6180|0),236,(6274|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE10StartArrayEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6PrefixENS_4TypeE($2,4);
 $3 = ((($2)) + 4|0);
 $4 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEPT_j($3,1)|0);
 __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE5LevelC2Eb($4,1);
 $5 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE15WriteStartArrayEv($2)|0);
 STACKTOP = sp;return ($5|0);
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE5BeginEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE5BeginEv($2)|0);
 STACKTOP = sp;return ($3|0);
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE3EndEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE3EndEv($2)|0);
 STACKTOP = sp;return ($3|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE8EndArrayEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = ((($4)) + 4|0);
 $6 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE7GetSizeEv($5)|0);
 $7 = ($6>>>0)>=(8);
 if (!($7)) {
  ___assert_fail((6234|0),(6180|0),249,(6385|0));
  // unreachable;
 }
 $8 = ((($4)) + 4|0);
 $9 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3TopINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEPT_v($8)|0);
 $10 = ((($9)) + 4|0);
 $11 = HEAP8[$10>>0]|0;
 $12 = $11&1;
 if ($12) {
  $13 = ((($4)) + 4|0);
  (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3PopINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEPT_j($13,1)|0);
  $14 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE13WriteEndArrayEv($4)|0);
  $15 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE8EndValueEb($4,$14)|0);
  STACKTOP = sp;return ($15|0);
 } else {
  ___assert_fail((6394|0),(6180|0),250,(6385|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6StringEPKcjb($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $8 = $3&1;
 $7 = $8;
 $9 = $4;
 $10 = $5;
 $11 = ($10|0)!=(0|0);
 if ($11) {
  __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6PrefixENS_4TypeE($9,5);
  $12 = $5;
  $13 = $6;
  $14 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE11WriteStringEPKcj($9,$12,$13)|0);
  $15 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE8EndValueEb($9,$14)|0);
  STACKTOP = sp;return ($15|0);
 } else {
  ___assert_fail((5893|0),(6180|0),205,(6438|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsDoubleEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 18|0);
 $4 = HEAP16[$3>>1]|0;
 $5 = $4&65535;
 $6 = $5 & 512;
 $7 = ($6|0)!=(0);
 STACKTOP = sp;return ($7|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6DoubleEd($0,$1) {
 $0 = $0|0;
 $1 = +$1;
 var $2 = 0, $3 = 0.0, $4 = 0, $5 = 0.0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6PrefixENS_4TypeE($4,6);
 $5 = $3;
 $6 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE11WriteDoubleEd($4,$5)|0);
 $7 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE8EndValueEb($4,$6)|0);
 STACKTOP = sp;return ($7|0);
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE5IsIntEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 18|0);
 $4 = HEAP16[$3>>1]|0;
 $5 = $4&65535;
 $6 = $5 & 32;
 $7 = ($6|0)!=(0);
 STACKTOP = sp;return ($7|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE3IntEi($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6PrefixENS_4TypeE($4,6);
 $5 = $3;
 $6 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE8WriteIntEi($4,$5)|0);
 $7 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE8EndValueEb($4,$6)|0);
 STACKTOP = sp;return ($7|0);
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE6IsUintEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 18|0);
 $4 = HEAP16[$3>>1]|0;
 $5 = $4&65535;
 $6 = $5 & 64;
 $7 = ($6|0)!=(0);
 STACKTOP = sp;return ($7|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE4UintEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6PrefixENS_4TypeE($4,6);
 $5 = $3;
 $6 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE9WriteUintEj($4,$5)|0);
 $7 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE8EndValueEb($4,$6)|0);
 STACKTOP = sp;return ($7|0);
}
function __ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE7IsInt64Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 18|0);
 $4 = HEAP16[$3>>1]|0;
 $5 = $4&65535;
 $6 = $5 & 128;
 $7 = ($6|0)!=(0);
 STACKTOP = sp;return ($7|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE5Int64Ex($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = sp;
 $3 = $0;
 $5 = $4;
 $6 = $5;
 HEAP32[$6>>2] = $1;
 $7 = (($5) + 4)|0;
 $8 = $7;
 HEAP32[$8>>2] = $2;
 $9 = $3;
 __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6PrefixENS_4TypeE($9,6);
 $10 = $4;
 $11 = $10;
 $12 = HEAP32[$11>>2]|0;
 $13 = (($10) + 4)|0;
 $14 = $13;
 $15 = HEAP32[$14>>2]|0;
 $16 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE10WriteInt64Ex($9,$12,$15)|0);
 $17 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE8EndValueEb($9,$16)|0);
 STACKTOP = sp;return ($17|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6Uint64Ey($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = sp;
 $3 = $0;
 $5 = $4;
 $6 = $5;
 HEAP32[$6>>2] = $1;
 $7 = (($5) + 4)|0;
 $8 = $7;
 HEAP32[$8>>2] = $2;
 $9 = $3;
 __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6PrefixENS_4TypeE($9,6);
 $10 = $4;
 $11 = $10;
 $12 = HEAP32[$11>>2]|0;
 $13 = (($10) + 4)|0;
 $14 = $13;
 $15 = HEAP32[$14>>2]|0;
 $16 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE11WriteUint64Ey($9,$12,$15)|0);
 $17 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE8EndValueEb($9,$16)|0);
 STACKTOP = sp;return ($17|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE6PrefixENS_4TypeE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $5 = $2;
 $6 = ((($5)) + 4|0);
 $7 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE7GetSizeEv($6)|0);
 $8 = ($7|0)!=(0);
 $9 = $8 ^ 1;
 $10 = $9 ^ 1;
 if (!($10)) {
  $39 = ((($5)) + 32|0);
  $40 = HEAP8[$39>>0]|0;
  $41 = $40&1;
  if ($41) {
   ___assert_fail((6224|0),(6180|0),485,(6217|0));
   // unreachable;
  }
  $42 = ((($5)) + 32|0);
  HEAP8[$42>>0] = 1;
  STACKTOP = sp;return;
 }
 $11 = ((($5)) + 4|0);
 $12 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3TopINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEPT_v($11)|0);
 $4 = $12;
 $13 = $4;
 $14 = HEAP32[$13>>2]|0;
 $15 = ($14>>>0)>(0);
 do {
  if ($15) {
   $16 = $4;
   $17 = ((($16)) + 4|0);
   $18 = HEAP8[$17>>0]|0;
   $19 = $18&1;
   $20 = HEAP32[$5>>2]|0;
   if ($19) {
    __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE3PutEc($20,44);
    break;
   } else {
    $21 = $4;
    $22 = HEAP32[$21>>2]|0;
    $23 = (($22>>>0) % 2)&-1;
    $24 = ($23|0)==(0);
    $25 = $24 ? 44 : 58;
    __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE3PutEc($20,$25);
    break;
   }
  }
 } while(0);
 $26 = $4;
 $27 = ((($26)) + 4|0);
 $28 = HEAP8[$27>>0]|0;
 $29 = $28&1;
 if (!($29)) {
  $30 = $4;
  $31 = HEAP32[$30>>2]|0;
  $32 = (($31>>>0) % 2)&-1;
  $33 = ($32|0)!=(0);
  $34 = $3;
  $35 = ($34|0)==(5);
  $or$cond = $33 | $35;
  if (!($or$cond)) {
   ___assert_fail((6160|0),(6180|0),481,(6217|0));
   // unreachable;
  }
 }
 $36 = $4;
 $37 = HEAP32[$36>>2]|0;
 $38 = (($37) + 1)|0;
 HEAP32[$36>>2] = $38;
 STACKTOP = sp;return;
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE8EndValueEb($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $4 = $1&1;
 $3 = $4;
 $5 = $2;
 $6 = ((($5)) + 4|0);
 $7 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE5EmptyEv($6)|0);
 $8 = $7 ^ 1;
 $9 = $8 ^ 1;
 if (!($9)) {
  $10 = $3;
  $11 = $10&1;
  STACKTOP = sp;return ($11|0);
 }
 __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE5FlushEv($5);
 $10 = $3;
 $11 = $10&1;
 STACKTOP = sp;return ($11|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE9WriteNullEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 __ZN9rapidjson10PutReserveINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EEj($3,4);
 $4 = HEAP32[$2>>2]|0;
 __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($4,110);
 $5 = HEAP32[$2>>2]|0;
 __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($5,117);
 $6 = HEAP32[$2>>2]|0;
 __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($6,108);
 $7 = HEAP32[$2>>2]|0;
 __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($7,108);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3TopINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEPT_v($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE7GetSizeEv($2)|0);
 $4 = ($3>>>0)>=(8);
 if ($4) {
  $5 = ((($2)) + 12|0);
  $6 = HEAP32[$5>>2]|0;
  $7 = ((($6)) + -8|0);
  STACKTOP = sp;return ($7|0);
 } else {
  ___assert_fail((5733|0),(4982|0),145,(5756|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE3PutEc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushIcEEPT_j($4,1)|0);
 HEAP8[$6>>0] = $5;
 STACKTOP = sp;return;
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE5FlushEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE5FlushEv($3);
 STACKTOP = sp;return;
}
function __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE5FlushEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return;
}
function __ZN9rapidjson10PutReserveINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE7ReserveEj($4,$5);
 STACKTOP = sp;return;
}
function __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE9PutUnsafeEc($4,$5);
 STACKTOP = sp;return;
}
function __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE7ReserveEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE7ReserveIcEEvj($4,$5);
 STACKTOP = sp;return;
}
function __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE9PutUnsafeEc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE10PushUnsafeIcEEPT_j($4,1)|0);
 HEAP8[$6>>0] = $5;
 STACKTOP = sp;return;
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE9WriteBoolEb($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $4 = $1&1;
 $3 = $4;
 $5 = $2;
 $6 = $3;
 $7 = $6&1;
 $8 = HEAP32[$5>>2]|0;
 if ($7) {
  __ZN9rapidjson10PutReserveINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EEj($8,4);
  $9 = HEAP32[$5>>2]|0;
  __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($9,116);
  $10 = HEAP32[$5>>2]|0;
  __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($10,114);
  $11 = HEAP32[$5>>2]|0;
  __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($11,117);
  $12 = HEAP32[$5>>2]|0;
  __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($12,101);
  STACKTOP = sp;return 1;
 } else {
  __ZN9rapidjson10PutReserveINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EEj($8,5);
  $13 = HEAP32[$5>>2]|0;
  __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($13,102);
  $14 = HEAP32[$5>>2]|0;
  __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($14,97);
  $15 = HEAP32[$5>>2]|0;
  __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($15,108);
  $16 = HEAP32[$5>>2]|0;
  __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($16,115);
  $17 = HEAP32[$5>>2]|0;
  __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($17,101);
  STACKTOP = sp;return 1;
 }
 return (0)|0;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEPT_j($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE7ReserveINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEvj($4,$5);
 $6 = $3;
 $7 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE10PushUnsafeINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEPT_j($4,$6)|0);
 STACKTOP = sp;return ($7|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE5LevelC2Eb($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $4 = $1&1;
 $3 = $4;
 $5 = $2;
 HEAP32[$5>>2] = 0;
 $6 = ((($5)) + 4|0);
 $7 = $3;
 $8 = $7&1;
 $9 = $8&1;
 HEAP8[$6>>0] = $9;
 STACKTOP = sp;return;
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE16WriteStartObjectEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE3PutEc($3,123);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE7ReserveINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEvj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = ((($4)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $3;
 $8 = $7<<3;
 $9 = (($6) + ($8)|0);
 $10 = ((($4)) + 16|0);
 $11 = HEAP32[$10>>2]|0;
 $12 = ($9>>>0)>($11>>>0);
 $13 = $12 ^ 1;
 $14 = $13 ^ 1;
 if (!($14)) {
  STACKTOP = sp;return;
 }
 $15 = $3;
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE6ExpandINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEvj($4,$15);
 STACKTOP = sp;return;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE10PushUnsafeINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEPT_j($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $5 = $2;
 $6 = ((($5)) + 12|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)!=(0|0);
 if (!($8)) {
  ___assert_fail((5127|0),(4982|0),129,(5137|0));
  // unreachable;
 }
 $9 = ((($5)) + 12|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = $3;
 $12 = $11<<3;
 $13 = (($10) + ($12)|0);
 $14 = ((($5)) + 16|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = ($13>>>0)<=($15>>>0);
 if ($16) {
  $17 = ((($5)) + 12|0);
  $18 = HEAP32[$17>>2]|0;
  $4 = $18;
  $19 = $3;
  $20 = $19<<3;
  $21 = ((($5)) + 12|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = (($22) + ($20)|0);
  HEAP32[$21>>2] = $23;
  $24 = $4;
  STACKTOP = sp;return ($24|0);
 } else {
  ___assert_fail((5148|0),(4982|0),130,(5137|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE6ExpandINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEvj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $6 = $2;
 $7 = ((($6)) + 8|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)==(0|0);
 if ($9) {
  $10 = HEAP32[$6>>2]|0;
  $11 = ($10|0)!=(0|0);
  if (!($11)) {
   $12 = (__Znwj(1)|0);
   HEAP32[$6>>2] = $12;
   $13 = ((($6)) + 4|0);
   HEAP32[$13>>2] = $12;
  }
  $14 = ((($6)) + 20|0);
  $15 = HEAP32[$14>>2]|0;
  $4 = $15;
 } else {
  $16 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE11GetCapacityEv($6)|0);
  $4 = $16;
  $17 = $4;
  $18 = (($17) + 1)|0;
  $19 = (($18>>>0) / 2)&-1;
  $20 = $4;
  $21 = (($20) + ($19))|0;
  $4 = $21;
 }
 $22 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE7GetSizeEv($6)|0);
 $23 = $3;
 $24 = $23<<3;
 $25 = (($22) + ($24))|0;
 $5 = $25;
 $26 = $4;
 $27 = $5;
 $28 = ($26>>>0)<($27>>>0);
 if (!($28)) {
  $30 = $4;
  __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE6ResizeEj($6,$30);
  STACKTOP = sp;return;
 }
 $29 = $5;
 $4 = $29;
 $30 = $4;
 __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE6ResizeEj($6,$30);
 STACKTOP = sp;return;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3PopINS_6WriterINS_19GenericStringBufferINS_4UTF8IcEES2_EES8_S8_S2_Lj0EE5LevelEEEPT_j($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = (__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE7GetSizeEv($4)|0);
 $6 = $3;
 $7 = $6<<3;
 $8 = ($5>>>0)>=($7>>>0);
 if ($8) {
  $9 = $3;
  $10 = $9<<3;
  $11 = ((($4)) + 12|0);
  $12 = HEAP32[$11>>2]|0;
  $13 = (0 - ($10))|0;
  $14 = (($12) + ($13)|0);
  HEAP32[$11>>2] = $14;
  $15 = ((($4)) + 12|0);
  $16 = HEAP32[$15>>2]|0;
  STACKTOP = sp;return ($16|0);
 } else {
  ___assert_fail((5630|0),(4982|0),138,(5661|0));
  // unreachable;
 }
 return (0)|0;
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE14WriteEndObjectEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE3PutEc($3,125);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE15WriteStartArrayEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE3PutEc($3,91);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE13WriteEndArrayEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE3PutEc($3,93);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE11WriteStringEPKcj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$expand_i1_val = 0, $$expand_i1_val2 = 0, $$pre_trunc = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $3 = sp + 21|0;
 $7 = sp;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $9 = $4;
 $10 = HEAP32[$9>>2]|0;
 $11 = $6;
 $12 = ($11*6)|0;
 $13 = (2 + ($12))|0;
 __ZN9rapidjson10PutReserveINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EEj($10,$13);
 $14 = HEAP32[$9>>2]|0;
 __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($14,34);
 $15 = $5;
 __ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEEC2EPKc($7,$15);
 while(1) {
  $16 = $6;
  $17 = (__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE24ScanWriteUnescapedStringERNS_19GenericStringStreamIS3_EEj($9,$7,$16)|0);
  if (!($17)) {
   label = 8;
   break;
  }
  $18 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4PeekEv($7)|0);
  $8 = $18;
  $19 = $8;
  $20 = $19&255;
  $21 = (6445 + ($20)|0);
  $22 = HEAP8[$21>>0]|0;
  $23 = ($22<<24>>24)!=(0);
  $24 = $23 ^ 1;
  $25 = $24 ^ 1;
  if (!($25)) {
   $52 = HEAP32[$9>>2]|0;
   $53 = (__ZN9rapidjson10TranscoderINS_4UTF8IcEES2_E15TranscodeUnsafeINS_19GenericStringStreamIS2_EENS_19GenericStringBufferIS2_NS_12CrtAllocatorEEEEEbRT_RT0_($7,$52)|0);
   $54 = $53 ^ 1;
   $55 = $54 ^ 1;
   $56 = $55 ^ 1;
   if ($56) {
    label = 7;
    break;
   } else {
    continue;
   }
  }
  (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($7)|0);
  $26 = HEAP32[$9>>2]|0;
  __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($26,92);
  $27 = HEAP32[$9>>2]|0;
  $28 = $8;
  $29 = $28&255;
  $30 = (6445 + ($29)|0);
  $31 = HEAP8[$30>>0]|0;
  __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($27,$31);
  $32 = $8;
  $33 = $32&255;
  $34 = (6445 + ($33)|0);
  $35 = HEAP8[$34>>0]|0;
  $36 = $35 << 24 >> 24;
  $37 = ($36|0)==(117);
  if (!($37)) {
   continue;
  }
  $38 = HEAP32[$9>>2]|0;
  __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($38,48);
  $39 = HEAP32[$9>>2]|0;
  __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($39,48);
  $40 = HEAP32[$9>>2]|0;
  $41 = $8;
  $42 = $41&255;
  $43 = $42 >> 4;
  $44 = (9036 + ($43)|0);
  $45 = HEAP8[$44>>0]|0;
  __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($40,$45);
  $46 = HEAP32[$9>>2]|0;
  $47 = $8;
  $48 = $47&255;
  $49 = $48 & 15;
  $50 = (9036 + ($49)|0);
  $51 = HEAP8[$50>>0]|0;
  __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($46,$51);
 }
 if ((label|0) == 7) {
  $$expand_i1_val = 0;
  HEAP8[$3>>0] = $$expand_i1_val;
  $$pre_trunc = HEAP8[$3>>0]|0;
  $58 = $$pre_trunc&1;
  STACKTOP = sp;return ($58|0);
 }
 else if ((label|0) == 8) {
  $57 = HEAP32[$9>>2]|0;
  __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($57,34);
  $$expand_i1_val2 = 1;
  HEAP8[$3>>0] = $$expand_i1_val2;
  $$pre_trunc = HEAP8[$3>>0]|0;
  $58 = $$pre_trunc&1;
  STACKTOP = sp;return ($58|0);
 }
 return (0)|0;
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE24ScanWriteUnescapedStringERNS_19GenericStringStreamIS3_EEj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $4;
 $7 = (__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv($6)|0);
 $8 = $5;
 $9 = ($7>>>0)<($8>>>0);
 $10 = $9 ^ 1;
 $11 = $10 ^ 1;
 STACKTOP = sp;return ($11|0);
}
function __ZN9rapidjson10TranscoderINS_4UTF8IcEES2_E15TranscodeUnsafeINS_19GenericStringStreamIS2_EENS_19GenericStringBufferIS2_NS_12CrtAllocatorEEEEEbRT_RT0_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = $2;
 $6 = (__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv($5)|0);
 __ZN9rapidjson9PutUnsafeINS_4UTF8IcEENS_12CrtAllocatorEEEvRNS_19GenericStringBufferIT_T0_EENS5_2ChE($4,$6);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE11WriteDoubleEd($0,$1) {
 $0 = $0|0;
 $1 = +$1;
 var $$expand_i1_val = 0, $$expand_i1_val2 = 0, $$pre_trunc = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0.0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $3 = 0, $4 = 0.0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $2 = sp + 28|0;
 $5 = sp;
 $3 = $0;
 $4 = $1;
 $8 = $3;
 $9 = $4;
 __ZN9rapidjson8internal6DoubleC2Ed($5,$9);
 $10 = (__ZNK9rapidjson8internal6Double10IsNanOrInfEv($5)|0);
 if ($10) {
  $$expand_i1_val = 0;
  HEAP8[$2>>0] = $$expand_i1_val;
  $$pre_trunc = HEAP8[$2>>0]|0;
  $25 = $$pre_trunc&1;
  STACKTOP = sp;return ($25|0);
 } else {
  $11 = HEAP32[$8>>2]|0;
  $12 = (__ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE4PushEj($11,25)|0);
  $6 = $12;
  $13 = $4;
  $14 = $6;
  $15 = ((($8)) + 28|0);
  $16 = HEAP32[$15>>2]|0;
  $17 = (__ZN9rapidjson8internal4dtoaEdPci($13,$14,$16)|0);
  $7 = $17;
  $18 = HEAP32[$8>>2]|0;
  $19 = $7;
  $20 = $6;
  $21 = $19;
  $22 = $20;
  $23 = (($21) - ($22))|0;
  $24 = (25 - ($23))|0;
  __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE3PopEj($18,$24);
  $$expand_i1_val2 = 1;
  HEAP8[$2>>0] = $$expand_i1_val2;
  $$pre_trunc = HEAP8[$2>>0]|0;
  $25 = $$pre_trunc&1;
  STACKTOP = sp;return ($25|0);
 }
 return (0)|0;
}
function __ZN9rapidjson8internal6DoubleC2Ed($0,$1) {
 $0 = $0|0;
 $1 = +$1;
 var $2 = 0, $3 = 0.0, $4 = 0, $5 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 HEAPF64[$4>>3] = $5;
 STACKTOP = sp;return;
}
function __ZNK9rapidjson8internal6Double10IsNanOrInfEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = $2;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + 4)|0;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = $8 & 2146435072;
 $10 = (0)==(0);
 $11 = ($9|0)==(2146435072);
 $12 = $10 & $11;
 STACKTOP = sp;return ($12|0);
}
function __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE4PushEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE4PushIcEEPT_j($4,$5)|0);
 STACKTOP = sp;return ($6|0);
}
function __ZN9rapidjson8internal4dtoaEdPci($0,$1,$2) {
 $0 = +$0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0.0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0.0, $25 = 0, $26 = 0, $27 = 0, $28 = 0.0, $29 = 0.0;
 var $3 = 0, $30 = 0.0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $4 = 0.0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $7 = sp;
 $8 = sp + 20|0;
 $9 = sp + 16|0;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $10 = $6;
 $11 = ($10|0)>=(1);
 if (!($11)) {
  ___assert_fail((6701|0),(6723|0),217,(6767|0));
  // unreachable;
 }
 $12 = $4;
 __ZN9rapidjson8internal6DoubleC2Ed($7,$12);
 $13 = (__ZNK9rapidjson8internal6Double6IsZeroEv($7)|0);
 if ($13) {
  $14 = (__ZNK9rapidjson8internal6Double4SignEv($7)|0);
  if ($14) {
   $15 = $5;
   $16 = ((($15)) + 1|0);
   $5 = $16;
   HEAP8[$15>>0] = 45;
  }
  $17 = $5;
  HEAP8[$17>>0] = 48;
  $18 = $5;
  $19 = ((($18)) + 1|0);
  HEAP8[$19>>0] = 46;
  $20 = $5;
  $21 = ((($20)) + 2|0);
  HEAP8[$21>>0] = 48;
  $22 = $5;
  $23 = ((($22)) + 3|0);
  $3 = $23;
  $37 = $3;
  STACKTOP = sp;return ($37|0);
 } else {
  $24 = $4;
  $25 = $24 < 0.0;
  if ($25) {
   $26 = $5;
   $27 = ((($26)) + 1|0);
   $5 = $27;
   HEAP8[$26>>0] = 45;
   $28 = $4;
   $29 = -$28;
   $4 = $29;
  }
  $30 = $4;
  $31 = $5;
  __ZN9rapidjson8internal6Grisu2EdPcPiS2_($30,$31,$8,$9);
  $32 = $5;
  $33 = HEAP32[$8>>2]|0;
  $34 = HEAP32[$9>>2]|0;
  $35 = $6;
  $36 = (__ZN9rapidjson8internal8PrettifyEPciii($32,$33,$34,$35)|0);
  $3 = $36;
  $37 = $3;
  STACKTOP = sp;return ($37|0);
 }
 return (0)|0;
}
function __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE3PopEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 (__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3PopIcEEPT_j($4,$5)|0);
 STACKTOP = sp;return;
}
function __ZNK9rapidjson8internal6Double6IsZeroEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = $2;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + 4)|0;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = $8 & 2147483647;
 $10 = ($5|0)==(0);
 $11 = ($9|0)==(0);
 $12 = $10 & $11;
 STACKTOP = sp;return ($12|0);
}
function __ZNK9rapidjson8internal6Double4SignEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = $2;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = (($3) + 4)|0;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = $8 & -2147483648;
 $10 = (0)!=(0);
 $11 = ($9|0)!=(0);
 $12 = $10 | $11;
 STACKTOP = sp;return ($12|0);
}
function __ZN9rapidjson8internal6Grisu2EdPcPiS2_($0,$1,$2,$3) {
 $0 = +$0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0.0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0.0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 160|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(160|0);
 $8 = sp + 112|0;
 $9 = sp + 96|0;
 $10 = sp + 80|0;
 $11 = sp + 64|0;
 $12 = sp + 48|0;
 $13 = sp + 32|0;
 $14 = sp + 16|0;
 $15 = sp;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $16 = $4;
 __ZN9rapidjson8internal5DiyFpC2Ed($8,$16);
 __ZN9rapidjson8internal5DiyFpC2Ev($9);
 __ZN9rapidjson8internal5DiyFpC2Ev($10);
 __ZNK9rapidjson8internal5DiyFp20NormalizedBoundariesEPS1_S2_($8,$9,$10);
 $17 = ((($10)) + 8|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = $7;
 __ZN9rapidjson8internal14GetCachedPowerEiPi($11,$18,$19);
 __ZNK9rapidjson8internal5DiyFp9NormalizeEv($13,$8);
 __ZNK9rapidjson8internal5DiyFpmlERKS1_($12,$13,$11);
 __ZNK9rapidjson8internal5DiyFpmlERKS1_($14,$10,$11);
 __ZNK9rapidjson8internal5DiyFpmlERKS1_($15,$9,$11);
 $20 = $15;
 $21 = $20;
 $22 = HEAP32[$21>>2]|0;
 $23 = (($20) + 4)|0;
 $24 = $23;
 $25 = HEAP32[$24>>2]|0;
 $26 = (_i64Add(($22|0),($25|0),1,0)|0);
 $27 = tempRet0;
 $28 = $15;
 $29 = $28;
 HEAP32[$29>>2] = $26;
 $30 = (($28) + 4)|0;
 $31 = $30;
 HEAP32[$31>>2] = $27;
 $32 = $14;
 $33 = $32;
 $34 = HEAP32[$33>>2]|0;
 $35 = (($32) + 4)|0;
 $36 = $35;
 $37 = HEAP32[$36>>2]|0;
 $38 = (_i64Add(($34|0),($37|0),-1,-1)|0);
 $39 = tempRet0;
 $40 = $14;
 $41 = $40;
 HEAP32[$41>>2] = $38;
 $42 = (($40) + 4)|0;
 $43 = $42;
 HEAP32[$43>>2] = $39;
 $44 = $14;
 $45 = $44;
 $46 = HEAP32[$45>>2]|0;
 $47 = (($44) + 4)|0;
 $48 = $47;
 $49 = HEAP32[$48>>2]|0;
 $50 = $15;
 $51 = $50;
 $52 = HEAP32[$51>>2]|0;
 $53 = (($50) + 4)|0;
 $54 = $53;
 $55 = HEAP32[$54>>2]|0;
 $56 = (_i64Subtract(($46|0),($49|0),($52|0),($55|0))|0);
 $57 = tempRet0;
 $58 = $5;
 $59 = $6;
 $60 = $7;
 __ZN9rapidjson8internal8DigitGenERKNS0_5DiyFpES3_yPcPiS5_($12,$14,$56,$57,$58,$59,$60);
 STACKTOP = sp;return;
}
function __ZN9rapidjson8internal8PrettifyEPciii($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0;
 var $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0;
 var $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0;
 var $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $or$cond = 0, $or$cond3 = 0, $or$cond5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $15 = $6;
 $16 = $7;
 $17 = (($15) + ($16))|0;
 $9 = $17;
 $18 = $7;
 $19 = (0)<=($18|0);
 $20 = $9;
 $21 = ($20|0)<=(21);
 $or$cond = $19 & $21;
 if ($or$cond) {
  $22 = $6;
  $10 = $22;
  while(1) {
   $23 = $10;
   $24 = $9;
   $25 = ($23|0)<($24|0);
   $26 = $5;
   if (!($25)) {
    break;
   }
   $27 = $10;
   $28 = (($26) + ($27)|0);
   HEAP8[$28>>0] = 48;
   $29 = $10;
   $30 = (($29) + 1)|0;
   $10 = $30;
  }
  $31 = $9;
  $32 = (($26) + ($31)|0);
  HEAP8[$32>>0] = 46;
  $33 = $5;
  $34 = $9;
  $35 = (($34) + 1)|0;
  $36 = (($33) + ($35)|0);
  HEAP8[$36>>0] = 48;
  $37 = $5;
  $38 = $9;
  $39 = (($38) + 2)|0;
  $40 = (($37) + ($39)|0);
  $4 = $40;
  $175 = $4;
  STACKTOP = sp;return ($175|0);
 }
 $41 = $9;
 $42 = (0)<($41|0);
 $43 = $9;
 $44 = ($43|0)<=(21);
 $or$cond3 = $42 & $44;
 if ($or$cond3) {
  $45 = $5;
  $46 = $9;
  $47 = (($46) + 1)|0;
  $48 = (($45) + ($47)|0);
  $49 = $5;
  $50 = $9;
  $51 = (($49) + ($50)|0);
  $52 = $6;
  $53 = $9;
  $54 = (($52) - ($53))|0;
  _memmove(($48|0),($51|0),($54|0))|0;
  $55 = $5;
  $56 = $9;
  $57 = (($55) + ($56)|0);
  HEAP8[$57>>0] = 46;
  $58 = $7;
  $59 = $8;
  $60 = (($58) + ($59))|0;
  $61 = (0)>($60|0);
  if (!($61)) {
   $84 = $5;
   $85 = $6;
   $86 = (($85) + 1)|0;
   $87 = (($84) + ($86)|0);
   $4 = $87;
   $175 = $4;
   STACKTOP = sp;return ($175|0);
  }
  $62 = $9;
  $63 = $8;
  $64 = (($62) + ($63))|0;
  $11 = $64;
  while(1) {
   $65 = $11;
   $66 = $9;
   $67 = (($66) + 1)|0;
   $68 = ($65|0)>($67|0);
   $69 = $5;
   if (!($68)) {
    label = 13;
    break;
   }
   $70 = $11;
   $71 = (($69) + ($70)|0);
   $72 = HEAP8[$71>>0]|0;
   $73 = $72 << 24 >> 24;
   $74 = ($73|0)!=(48);
   if ($74) {
    label = 11;
    break;
   }
   $79 = $11;
   $80 = (($79) + -1)|0;
   $11 = $80;
  }
  if ((label|0) == 11) {
   $75 = $5;
   $76 = $11;
   $77 = (($76) + 1)|0;
   $78 = (($75) + ($77)|0);
   $4 = $78;
   $175 = $4;
   STACKTOP = sp;return ($175|0);
  }
  else if ((label|0) == 13) {
   $81 = $9;
   $82 = (($81) + 2)|0;
   $83 = (($69) + ($82)|0);
   $4 = $83;
   $175 = $4;
   STACKTOP = sp;return ($175|0);
  }
 }
 $88 = $9;
 $89 = (-6)<($88|0);
 $90 = $9;
 $91 = ($90|0)<=(0);
 $or$cond5 = $89 & $91;
 $92 = $9;
 if (!($or$cond5)) {
  $137 = $8;
  $138 = (0 - ($137))|0;
  $139 = ($92|0)<($138|0);
  if ($139) {
   $140 = $5;
   HEAP8[$140>>0] = 48;
   $141 = $5;
   $142 = ((($141)) + 1|0);
   HEAP8[$142>>0] = 46;
   $143 = $5;
   $144 = ((($143)) + 2|0);
   HEAP8[$144>>0] = 48;
   $145 = $5;
   $146 = ((($145)) + 3|0);
   $4 = $146;
   $175 = $4;
   STACKTOP = sp;return ($175|0);
  }
  $147 = $6;
  $148 = ($147|0)==(1);
  $149 = $5;
  if ($148) {
   $150 = ((($149)) + 1|0);
   HEAP8[$150>>0] = 101;
   $151 = $9;
   $152 = (($151) - 1)|0;
   $153 = $5;
   $154 = ((($153)) + 2|0);
   $155 = (__ZN9rapidjson8internal13WriteExponentEiPc($152,$154)|0);
   $4 = $155;
   $175 = $4;
   STACKTOP = sp;return ($175|0);
  } else {
   $156 = ((($149)) + 2|0);
   $157 = $5;
   $158 = ((($157)) + 1|0);
   $159 = $6;
   $160 = (($159) - 1)|0;
   _memmove(($156|0),($158|0),($160|0))|0;
   $161 = $5;
   $162 = ((($161)) + 1|0);
   HEAP8[$162>>0] = 46;
   $163 = $5;
   $164 = $6;
   $165 = (($164) + 1)|0;
   $166 = (($163) + ($165)|0);
   HEAP8[$166>>0] = 101;
   $167 = $9;
   $168 = (($167) - 1)|0;
   $169 = $5;
   $170 = $6;
   $171 = (0 + ($170))|0;
   $172 = (($171) + 2)|0;
   $173 = (($169) + ($172)|0);
   $174 = (__ZN9rapidjson8internal13WriteExponentEiPc($168,$173)|0);
   $4 = $174;
   $175 = $4;
   STACKTOP = sp;return ($175|0);
  }
 }
 $93 = (2 - ($92))|0;
 $12 = $93;
 $94 = $5;
 $95 = $12;
 $96 = (($94) + ($95)|0);
 $97 = $5;
 $98 = $6;
 _memmove(($96|0),($97|0),($98|0))|0;
 $99 = $5;
 HEAP8[$99>>0] = 48;
 $100 = $5;
 $101 = ((($100)) + 1|0);
 HEAP8[$101>>0] = 46;
 $13 = 2;
 while(1) {
  $102 = $13;
  $103 = $12;
  $104 = ($102|0)<($103|0);
  if (!($104)) {
   break;
  }
  $105 = $5;
  $106 = $13;
  $107 = (($105) + ($106)|0);
  HEAP8[$107>>0] = 48;
  $108 = $13;
  $109 = (($108) + 1)|0;
  $13 = $109;
 }
 $110 = $6;
 $111 = $9;
 $112 = (($110) - ($111))|0;
 $113 = $8;
 $114 = ($112|0)>($113|0);
 if (!($114)) {
  $132 = $5;
  $133 = $6;
  $134 = $12;
  $135 = (($133) + ($134))|0;
  $136 = (($132) + ($135)|0);
  $4 = $136;
  $175 = $4;
  STACKTOP = sp;return ($175|0);
 }
 $115 = $8;
 $116 = (($115) + 1)|0;
 $14 = $116;
 while(1) {
  $117 = $14;
  $118 = ($117|0)>(2);
  $119 = $5;
  if (!($118)) {
   label = 25;
   break;
  }
  $120 = $14;
  $121 = (($119) + ($120)|0);
  $122 = HEAP8[$121>>0]|0;
  $123 = $122 << 24 >> 24;
  $124 = ($123|0)!=(48);
  if ($124) {
   label = 23;
   break;
  }
  $129 = $14;
  $130 = (($129) + -1)|0;
  $14 = $130;
 }
 if ((label|0) == 23) {
  $125 = $5;
  $126 = $14;
  $127 = (($126) + 1)|0;
  $128 = (($125) + ($127)|0);
  $4 = $128;
  $175 = $4;
  STACKTOP = sp;return ($175|0);
 }
 else if ((label|0) == 25) {
  $131 = ((($119)) + 3|0);
  $4 = $131;
  $175 = $4;
  STACKTOP = sp;return ($175|0);
 }
 return (0)|0;
}
function __ZN9rapidjson8internal5DiyFpC2Ed($0,$1) {
 $0 = $0|0;
 $1 = +$1;
 var $$sink = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0.0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = sp + 8|0;
 $6 = sp;
 $2 = $0;
 $3 = $1;
 $7 = $2;
 $8 = $3;
 HEAPF64[$4>>3] = $8;
 $9 = $4;
 $10 = $9;
 $11 = HEAP32[$10>>2]|0;
 $12 = (($9) + 4)|0;
 $13 = $12;
 $14 = HEAP32[$13>>2]|0;
 $15 = $14 & 2146435072;
 $16 = (_bitshift64Lshr(0,($15|0),52)|0);
 $17 = tempRet0;
 $5 = $16;
 $18 = $4;
 $19 = $18;
 $20 = HEAP32[$19>>2]|0;
 $21 = (($18) + 4)|0;
 $22 = $21;
 $23 = HEAP32[$22>>2]|0;
 $24 = $23 & 1048575;
 $25 = $6;
 $26 = $25;
 HEAP32[$26>>2] = $20;
 $27 = (($25) + 4)|0;
 $28 = $27;
 HEAP32[$28>>2] = $24;
 $29 = $5;
 $30 = ($29|0)!=(0);
 $31 = $6;
 $32 = $31;
 $33 = HEAP32[$32>>2]|0;
 $34 = (($31) + 4)|0;
 $35 = $34;
 $36 = HEAP32[$35>>2]|0;
 if ($30) {
  $37 = (_i64Add(($33|0),($36|0),0,1048576)|0);
  $38 = tempRet0;
  $39 = $7;
  $40 = $39;
  HEAP32[$40>>2] = $37;
  $41 = (($39) + 4)|0;
  $42 = $41;
  HEAP32[$42>>2] = $38;
  $43 = $5;
  $44 = (($43) - 1075)|0;
  $$sink = $44;
  $49 = ((($7)) + 8|0);
  HEAP32[$49>>2] = $$sink;
  STACKTOP = sp;return;
 } else {
  $45 = $7;
  $46 = $45;
  HEAP32[$46>>2] = $33;
  $47 = (($45) + 4)|0;
  $48 = $47;
  HEAP32[$48>>2] = $36;
  $$sink = -1074;
  $49 = ((($7)) + 8|0);
  HEAP32[$49>>2] = $$sink;
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson8internal5DiyFpC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = $2;
 $4 = $3;
 HEAP32[$4>>2] = 0;
 $5 = (($3) + 4)|0;
 $6 = $5;
 HEAP32[$6>>2] = 0;
 $7 = ((($2)) + 8|0);
 HEAP32[$7>>2] = 0;
 STACKTOP = sp;return;
}
function __ZNK9rapidjson8internal5DiyFp20NormalizedBoundariesEPS1_S2_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $6 = sp + 32|0;
 $7 = sp + 16|0;
 $8 = sp;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $9 = $3;
 $10 = $9;
 $11 = $10;
 $12 = HEAP32[$11>>2]|0;
 $13 = (($10) + 4)|0;
 $14 = $13;
 $15 = HEAP32[$14>>2]|0;
 $16 = (_bitshift64Shl(($12|0),($15|0),1)|0);
 $17 = tempRet0;
 $18 = (_i64Add(($16|0),($17|0),1,0)|0);
 $19 = tempRet0;
 $20 = ((($9)) + 8|0);
 $21 = HEAP32[$20>>2]|0;
 $22 = (($21) - 1)|0;
 __ZN9rapidjson8internal5DiyFpC2Eyi($7,$18,$19,$22);
 __ZNK9rapidjson8internal5DiyFp17NormalizeBoundaryEv($6,$7);
 $23 = $9;
 $24 = $23;
 $25 = HEAP32[$24>>2]|0;
 $26 = (($23) + 4)|0;
 $27 = $26;
 $28 = HEAP32[$27>>2]|0;
 $29 = ($25|0)==(0);
 $30 = ($28|0)==(1048576);
 $31 = $29 & $30;
 $32 = $9;
 $33 = $32;
 $34 = HEAP32[$33>>2]|0;
 $35 = (($32) + 4)|0;
 $36 = $35;
 $37 = HEAP32[$36>>2]|0;
 if ($31) {
  $38 = (_bitshift64Shl(($34|0),($37|0),2)|0);
  $39 = tempRet0;
  $40 = (_i64Subtract(($38|0),($39|0),1,0)|0);
  $41 = tempRet0;
  $42 = ((($9)) + 8|0);
  $43 = HEAP32[$42>>2]|0;
  $44 = (($43) - 2)|0;
  __ZN9rapidjson8internal5DiyFpC2Eyi($8,$40,$41,$44);
 } else {
  $45 = (_bitshift64Shl(($34|0),($37|0),1)|0);
  $46 = tempRet0;
  $47 = (_i64Subtract(($45|0),($46|0),1,0)|0);
  $48 = tempRet0;
  $49 = ((($9)) + 8|0);
  $50 = HEAP32[$49>>2]|0;
  $51 = (($50) - 1)|0;
  __ZN9rapidjson8internal5DiyFpC2Eyi($8,$47,$48,$51);
 }
 $52 = ((($8)) + 8|0);
 $53 = HEAP32[$52>>2]|0;
 $54 = ((($6)) + 8|0);
 $55 = HEAP32[$54>>2]|0;
 $56 = (($53) - ($55))|0;
 $57 = $8;
 $58 = $57;
 $59 = HEAP32[$58>>2]|0;
 $60 = (($57) + 4)|0;
 $61 = $60;
 $62 = HEAP32[$61>>2]|0;
 $63 = (_bitshift64Shl(($59|0),($62|0),($56|0))|0);
 $64 = tempRet0;
 $65 = $8;
 $66 = $65;
 HEAP32[$66>>2] = $63;
 $67 = (($65) + 4)|0;
 $68 = $67;
 HEAP32[$68>>2] = $64;
 $69 = ((($6)) + 8|0);
 $70 = HEAP32[$69>>2]|0;
 $71 = ((($8)) + 8|0);
 HEAP32[$71>>2] = $70;
 $72 = $5;
 ;HEAP32[$72>>2]=HEAP32[$6>>2]|0;HEAP32[$72+4>>2]=HEAP32[$6+4>>2]|0;HEAP32[$72+8>>2]=HEAP32[$6+8>>2]|0;
 $73 = $4;
 ;HEAP32[$73>>2]=HEAP32[$8>>2]|0;HEAP32[$73+4>>2]=HEAP32[$8+4>>2]|0;HEAP32[$73+8>>2]=HEAP32[$8+8>>2]|0;
 STACKTOP = sp;return;
}
function __ZN9rapidjson8internal14GetCachedPowerEiPi($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0.0, $11 = 0.0, $12 = 0.0, $13 = 0.0, $14 = 0, $15 = 0.0, $16 = 0, $17 = 0.0, $18 = 0.0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $4 = 0, $5 = 0.0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $3 = $1;
 $4 = $2;
 $8 = $3;
 $9 = (-61 - ($8))|0;
 $10 = (+($9|0));
 $11 = $10 * 0.30102999566398114;
 $12 = $11 + 347.0;
 $5 = $12;
 $13 = $5;
 $14 = (~~(($13)));
 $6 = $14;
 $15 = $5;
 $16 = $6;
 $17 = (+($16|0));
 $18 = $15 - $17;
 $19 = $18 > 0.0;
 if ($19) {
  $20 = $6;
  $21 = (($20) + 1)|0;
  $6 = $21;
 }
 $22 = $6;
 $23 = $22 >> 3;
 $24 = (($23) + 1)|0;
 $7 = $24;
 $25 = $7;
 $26 = $25 << 3;
 $27 = (-348 + ($26))|0;
 $28 = (0 - ($27))|0;
 $29 = $4;
 HEAP32[$29>>2] = $28;
 $30 = $7;
 __ZN9rapidjson8internal21GetCachedPowerByIndexEj($0,$30);
 STACKTOP = sp;return;
}
function __ZNK9rapidjson8internal5DiyFp9NormalizeEv($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $3 = 0, $4 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $1;
 $4 = $2;
 $5 = $4;
 $6 = $5;
 $7 = HEAP32[$6>>2]|0;
 $8 = (($5) + 4)|0;
 $9 = $8;
 $10 = HEAP32[$9>>2]|0;
 $11 = (_llvm_ctlz_i64(($7|0),($10|0),0)|0);
 $12 = tempRet0;
 $3 = $11;
 $13 = $4;
 $14 = $13;
 $15 = HEAP32[$14>>2]|0;
 $16 = (($13) + 4)|0;
 $17 = $16;
 $18 = HEAP32[$17>>2]|0;
 $19 = $3;
 $20 = (_bitshift64Shl(($15|0),($18|0),($19|0))|0);
 $21 = tempRet0;
 $22 = ((($4)) + 8|0);
 $23 = HEAP32[$22>>2]|0;
 $24 = $3;
 $25 = (($23) - ($24))|0;
 __ZN9rapidjson8internal5DiyFpC2Eyi($0,$20,$21,$25);
 STACKTOP = sp;return;
}
function __ZNK9rapidjson8internal5DiyFpmlERKS1_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0;
 var $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0;
 var $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0;
 var $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0;
 var $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $5 = sp + 72|0;
 $6 = sp + 64|0;
 $7 = sp + 56|0;
 $8 = sp + 48|0;
 $9 = sp + 40|0;
 $10 = sp + 32|0;
 $11 = sp + 24|0;
 $12 = sp + 16|0;
 $13 = sp + 8|0;
 $14 = sp;
 $3 = $1;
 $4 = $2;
 $15 = $3;
 $16 = $5;
 $17 = $16;
 HEAP32[$17>>2] = -1;
 $18 = (($16) + 4)|0;
 $19 = $18;
 HEAP32[$19>>2] = 0;
 $20 = $15;
 $21 = $20;
 $22 = HEAP32[$21>>2]|0;
 $23 = (($20) + 4)|0;
 $24 = $23;
 $25 = HEAP32[$24>>2]|0;
 $26 = $6;
 $27 = $26;
 HEAP32[$27>>2] = $25;
 $28 = (($26) + 4)|0;
 $29 = $28;
 HEAP32[$29>>2] = 0;
 $30 = $15;
 $31 = $30;
 $32 = HEAP32[$31>>2]|0;
 $33 = (($30) + 4)|0;
 $34 = $33;
 $35 = HEAP32[$34>>2]|0;
 $36 = $7;
 $37 = $36;
 HEAP32[$37>>2] = $32;
 $38 = (($36) + 4)|0;
 $39 = $38;
 HEAP32[$39>>2] = 0;
 $40 = $4;
 $41 = $40;
 $42 = $41;
 $43 = HEAP32[$42>>2]|0;
 $44 = (($41) + 4)|0;
 $45 = $44;
 $46 = HEAP32[$45>>2]|0;
 $47 = $8;
 $48 = $47;
 HEAP32[$48>>2] = $46;
 $49 = (($47) + 4)|0;
 $50 = $49;
 HEAP32[$50>>2] = 0;
 $51 = $4;
 $52 = $51;
 $53 = $52;
 $54 = HEAP32[$53>>2]|0;
 $55 = (($52) + 4)|0;
 $56 = $55;
 $57 = HEAP32[$56>>2]|0;
 $58 = $9;
 $59 = $58;
 HEAP32[$59>>2] = $54;
 $60 = (($58) + 4)|0;
 $61 = $60;
 HEAP32[$61>>2] = 0;
 $62 = $6;
 $63 = $62;
 $64 = HEAP32[$63>>2]|0;
 $65 = (($62) + 4)|0;
 $66 = $65;
 $67 = HEAP32[$66>>2]|0;
 $68 = $8;
 $69 = $68;
 $70 = HEAP32[$69>>2]|0;
 $71 = (($68) + 4)|0;
 $72 = $71;
 $73 = HEAP32[$72>>2]|0;
 $74 = (___muldi3(($64|0),($67|0),($70|0),($73|0))|0);
 $75 = tempRet0;
 $76 = $10;
 $77 = $76;
 HEAP32[$77>>2] = $74;
 $78 = (($76) + 4)|0;
 $79 = $78;
 HEAP32[$79>>2] = $75;
 $80 = $7;
 $81 = $80;
 $82 = HEAP32[$81>>2]|0;
 $83 = (($80) + 4)|0;
 $84 = $83;
 $85 = HEAP32[$84>>2]|0;
 $86 = $8;
 $87 = $86;
 $88 = HEAP32[$87>>2]|0;
 $89 = (($86) + 4)|0;
 $90 = $89;
 $91 = HEAP32[$90>>2]|0;
 $92 = (___muldi3(($82|0),($85|0),($88|0),($91|0))|0);
 $93 = tempRet0;
 $94 = $11;
 $95 = $94;
 HEAP32[$95>>2] = $92;
 $96 = (($94) + 4)|0;
 $97 = $96;
 HEAP32[$97>>2] = $93;
 $98 = $6;
 $99 = $98;
 $100 = HEAP32[$99>>2]|0;
 $101 = (($98) + 4)|0;
 $102 = $101;
 $103 = HEAP32[$102>>2]|0;
 $104 = $9;
 $105 = $104;
 $106 = HEAP32[$105>>2]|0;
 $107 = (($104) + 4)|0;
 $108 = $107;
 $109 = HEAP32[$108>>2]|0;
 $110 = (___muldi3(($100|0),($103|0),($106|0),($109|0))|0);
 $111 = tempRet0;
 $112 = $12;
 $113 = $112;
 HEAP32[$113>>2] = $110;
 $114 = (($112) + 4)|0;
 $115 = $114;
 HEAP32[$115>>2] = $111;
 $116 = $7;
 $117 = $116;
 $118 = HEAP32[$117>>2]|0;
 $119 = (($116) + 4)|0;
 $120 = $119;
 $121 = HEAP32[$120>>2]|0;
 $122 = $9;
 $123 = $122;
 $124 = HEAP32[$123>>2]|0;
 $125 = (($122) + 4)|0;
 $126 = $125;
 $127 = HEAP32[$126>>2]|0;
 $128 = (___muldi3(($118|0),($121|0),($124|0),($127|0))|0);
 $129 = tempRet0;
 $130 = $13;
 $131 = $130;
 HEAP32[$131>>2] = $128;
 $132 = (($130) + 4)|0;
 $133 = $132;
 HEAP32[$133>>2] = $129;
 $134 = $13;
 $135 = $134;
 $136 = HEAP32[$135>>2]|0;
 $137 = (($134) + 4)|0;
 $138 = $137;
 $139 = HEAP32[$138>>2]|0;
 $140 = $12;
 $141 = $140;
 $142 = HEAP32[$141>>2]|0;
 $143 = (($140) + 4)|0;
 $144 = $143;
 $145 = HEAP32[$144>>2]|0;
 $146 = (_i64Add(($139|0),0,($142|0),0)|0);
 $147 = tempRet0;
 $148 = $11;
 $149 = $148;
 $150 = HEAP32[$149>>2]|0;
 $151 = (($148) + 4)|0;
 $152 = $151;
 $153 = HEAP32[$152>>2]|0;
 $154 = (_i64Add(($146|0),($147|0),($150|0),0)|0);
 $155 = tempRet0;
 $156 = $14;
 $157 = $156;
 HEAP32[$157>>2] = $154;
 $158 = (($156) + 4)|0;
 $159 = $158;
 HEAP32[$159>>2] = $155;
 $160 = $14;
 $161 = $160;
 $162 = HEAP32[$161>>2]|0;
 $163 = (($160) + 4)|0;
 $164 = $163;
 $165 = HEAP32[$164>>2]|0;
 $166 = (_i64Add(($162|0),($165|0),-2147483648,0)|0);
 $167 = tempRet0;
 $168 = $14;
 $169 = $168;
 HEAP32[$169>>2] = $166;
 $170 = (($168) + 4)|0;
 $171 = $170;
 HEAP32[$171>>2] = $167;
 $172 = $10;
 $173 = $172;
 $174 = HEAP32[$173>>2]|0;
 $175 = (($172) + 4)|0;
 $176 = $175;
 $177 = HEAP32[$176>>2]|0;
 $178 = $12;
 $179 = $178;
 $180 = HEAP32[$179>>2]|0;
 $181 = (($178) + 4)|0;
 $182 = $181;
 $183 = HEAP32[$182>>2]|0;
 $184 = (_i64Add(($174|0),($177|0),($183|0),0)|0);
 $185 = tempRet0;
 $186 = $11;
 $187 = $186;
 $188 = HEAP32[$187>>2]|0;
 $189 = (($186) + 4)|0;
 $190 = $189;
 $191 = HEAP32[$190>>2]|0;
 $192 = (_i64Add(($184|0),($185|0),($191|0),0)|0);
 $193 = tempRet0;
 $194 = $14;
 $195 = $194;
 $196 = HEAP32[$195>>2]|0;
 $197 = (($194) + 4)|0;
 $198 = $197;
 $199 = HEAP32[$198>>2]|0;
 $200 = (_i64Add(($192|0),($193|0),($199|0),0)|0);
 $201 = tempRet0;
 $202 = ((($15)) + 8|0);
 $203 = HEAP32[$202>>2]|0;
 $204 = $4;
 $205 = ((($204)) + 8|0);
 $206 = HEAP32[$205>>2]|0;
 $207 = (($203) + ($206))|0;
 $208 = (($207) + 64)|0;
 __ZN9rapidjson8internal5DiyFpC2Eyi($0,$200,$201,$208);
 STACKTOP = sp;return;
}
function __ZN9rapidjson8internal8DigitGenERKNS0_5DiyFpES3_yPcPiS5_($0,$1,$2,$3,$4,$5,$6) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0;
 var $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0;
 var $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0;
 var $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0;
 var $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0;
 var $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0;
 var $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0;
 var $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0;
 var $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $9 = sp + 48|0;
 $13 = sp + 32|0;
 $14 = sp + 16|0;
 $16 = sp + 8|0;
 $19 = sp;
 $7 = $0;
 $8 = $1;
 $22 = $9;
 $23 = $22;
 HEAP32[$23>>2] = $2;
 $24 = (($22) + 4)|0;
 $25 = $24;
 HEAP32[$25>>2] = $3;
 $10 = $4;
 $11 = $5;
 $12 = $6;
 $26 = $8;
 $27 = ((($26)) + 8|0);
 $28 = HEAP32[$27>>2]|0;
 $29 = (0 - ($28))|0;
 $30 = (_bitshift64Shl(1,0,($29|0))|0);
 $31 = tempRet0;
 $32 = $8;
 $33 = ((($32)) + 8|0);
 $34 = HEAP32[$33>>2]|0;
 __ZN9rapidjson8internal5DiyFpC2Eyi($13,$30,$31,$34);
 $35 = $8;
 $36 = $7;
 __ZNK9rapidjson8internal5DiyFpmiERKS1_($14,$35,$36);
 $37 = $8;
 $38 = $37;
 $39 = $38;
 $40 = HEAP32[$39>>2]|0;
 $41 = (($38) + 4)|0;
 $42 = $41;
 $43 = HEAP32[$42>>2]|0;
 $44 = ((($13)) + 8|0);
 $45 = HEAP32[$44>>2]|0;
 $46 = (0 - ($45))|0;
 $47 = (_bitshift64Lshr(($40|0),($43|0),($46|0))|0);
 $48 = tempRet0;
 $15 = $47;
 $49 = $8;
 $50 = $49;
 $51 = $50;
 $52 = HEAP32[$51>>2]|0;
 $53 = (($50) + 4)|0;
 $54 = $53;
 $55 = HEAP32[$54>>2]|0;
 $56 = $13;
 $57 = $56;
 $58 = HEAP32[$57>>2]|0;
 $59 = (($56) + 4)|0;
 $60 = $59;
 $61 = HEAP32[$60>>2]|0;
 $62 = (_i64Subtract(($58|0),($61|0),1,0)|0);
 $63 = tempRet0;
 $64 = $52 & $62;
 $65 = $55 & $63;
 $66 = $16;
 $67 = $66;
 HEAP32[$67>>2] = $64;
 $68 = (($66) + 4)|0;
 $69 = $68;
 HEAP32[$69>>2] = $65;
 $70 = $15;
 $71 = (__ZN9rapidjson8internal19CountDecimalDigit32Ej($70)|0);
 $17 = $71;
 $72 = $11;
 HEAP32[$72>>2] = 0;
 while(1) {
  $73 = $17;
  $74 = ($73|0)>(0);
  if (!($74)) {
   break;
  }
  $18 = 0;
  $75 = $17;
  switch ($75|0) {
  case 9:  {
   $76 = $15;
   $77 = (($76>>>0) / 100000000)&-1;
   $18 = $77;
   $78 = $15;
   $79 = (($78>>>0) % 100000000)&-1;
   $15 = $79;
   break;
  }
  case 8:  {
   $80 = $15;
   $81 = (($80>>>0) / 10000000)&-1;
   $18 = $81;
   $82 = $15;
   $83 = (($82>>>0) % 10000000)&-1;
   $15 = $83;
   break;
  }
  case 7:  {
   $84 = $15;
   $85 = (($84>>>0) / 1000000)&-1;
   $18 = $85;
   $86 = $15;
   $87 = (($86>>>0) % 1000000)&-1;
   $15 = $87;
   break;
  }
  case 6:  {
   $88 = $15;
   $89 = (($88>>>0) / 100000)&-1;
   $18 = $89;
   $90 = $15;
   $91 = (($90>>>0) % 100000)&-1;
   $15 = $91;
   break;
  }
  case 5:  {
   $92 = $15;
   $93 = (($92>>>0) / 10000)&-1;
   $18 = $93;
   $94 = $15;
   $95 = (($94>>>0) % 10000)&-1;
   $15 = $95;
   break;
  }
  case 4:  {
   $96 = $15;
   $97 = (($96>>>0) / 1000)&-1;
   $18 = $97;
   $98 = $15;
   $99 = (($98>>>0) % 1000)&-1;
   $15 = $99;
   break;
  }
  case 3:  {
   $100 = $15;
   $101 = (($100>>>0) / 100)&-1;
   $18 = $101;
   $102 = $15;
   $103 = (($102>>>0) % 100)&-1;
   $15 = $103;
   break;
  }
  case 2:  {
   $104 = $15;
   $105 = (($104>>>0) / 10)&-1;
   $18 = $105;
   $106 = $15;
   $107 = (($106>>>0) % 10)&-1;
   $15 = $107;
   break;
  }
  case 1:  {
   $108 = $15;
   $18 = $108;
   $15 = 0;
   break;
  }
  default: {
  }
  }
  $109 = $18;
  $110 = ($109|0)!=(0);
  if ($110) {
   label = 15;
  } else {
   $111 = $11;
   $112 = HEAP32[$111>>2]|0;
   $113 = ($112|0)!=(0);
   if ($113) {
    label = 15;
   }
  }
  if ((label|0) == 15) {
   label = 0;
   $114 = $18;
   $115 = $114&255;
   $116 = $115 << 24 >> 24;
   $117 = (48 + ($116))|0;
   $118 = $117&255;
   $119 = $10;
   $120 = $11;
   $121 = HEAP32[$120>>2]|0;
   $122 = (($121) + 1)|0;
   HEAP32[$120>>2] = $122;
   $123 = (($119) + ($121)|0);
   HEAP8[$123>>0] = $118;
  }
  $124 = $17;
  $125 = (($124) + -1)|0;
  $17 = $125;
  $126 = $15;
  $127 = ((($13)) + 8|0);
  $128 = HEAP32[$127>>2]|0;
  $129 = (0 - ($128))|0;
  $130 = (_bitshift64Shl(($126|0),0,($129|0))|0);
  $131 = tempRet0;
  $132 = $16;
  $133 = $132;
  $134 = HEAP32[$133>>2]|0;
  $135 = (($132) + 4)|0;
  $136 = $135;
  $137 = HEAP32[$136>>2]|0;
  $138 = (_i64Add(($130|0),($131|0),($134|0),($137|0))|0);
  $139 = tempRet0;
  $140 = $19;
  $141 = $140;
  HEAP32[$141>>2] = $138;
  $142 = (($140) + 4)|0;
  $143 = $142;
  HEAP32[$143>>2] = $139;
  $144 = $19;
  $145 = $144;
  $146 = HEAP32[$145>>2]|0;
  $147 = (($144) + 4)|0;
  $148 = $147;
  $149 = HEAP32[$148>>2]|0;
  $150 = $9;
  $151 = $150;
  $152 = HEAP32[$151>>2]|0;
  $153 = (($150) + 4)|0;
  $154 = $153;
  $155 = HEAP32[$154>>2]|0;
  $156 = ($149>>>0)<($155>>>0);
  $157 = ($146>>>0)<=($152>>>0);
  $158 = ($149|0)==($155|0);
  $159 = $158 & $157;
  $160 = $156 | $159;
  if ($160) {
   label = 17;
   break;
  }
 }
 if ((label|0) == 17) {
  $161 = $17;
  $162 = $12;
  $163 = HEAP32[$162>>2]|0;
  $164 = (($163) + ($161))|0;
  HEAP32[$162>>2] = $164;
  $165 = $10;
  $166 = $11;
  $167 = HEAP32[$166>>2]|0;
  $168 = $9;
  $169 = $168;
  $170 = HEAP32[$169>>2]|0;
  $171 = (($168) + 4)|0;
  $172 = $171;
  $173 = HEAP32[$172>>2]|0;
  $174 = $19;
  $175 = $174;
  $176 = HEAP32[$175>>2]|0;
  $177 = (($174) + 4)|0;
  $178 = $177;
  $179 = HEAP32[$178>>2]|0;
  $180 = $17;
  $181 = (3688 + ($180<<2)|0);
  $182 = HEAP32[$181>>2]|0;
  $183 = ((($13)) + 8|0);
  $184 = HEAP32[$183>>2]|0;
  $185 = (0 - ($184))|0;
  $186 = (_bitshift64Shl(($182|0),0,($185|0))|0);
  $187 = tempRet0;
  $188 = $14;
  $189 = $188;
  $190 = HEAP32[$189>>2]|0;
  $191 = (($188) + 4)|0;
  $192 = $191;
  $193 = HEAP32[$192>>2]|0;
  __ZN9rapidjson8internal10GrisuRoundEPciyyyy($165,$167,$170,$173,$176,$179,$186,$187,$190,$193);
  STACKTOP = sp;return;
 }
 while(1) {
  $194 = $16;
  $195 = $194;
  $196 = HEAP32[$195>>2]|0;
  $197 = (($194) + 4)|0;
  $198 = $197;
  $199 = HEAP32[$198>>2]|0;
  $200 = (___muldi3(($196|0),($199|0),10,0)|0);
  $201 = tempRet0;
  $202 = $16;
  $203 = $202;
  HEAP32[$203>>2] = $200;
  $204 = (($202) + 4)|0;
  $205 = $204;
  HEAP32[$205>>2] = $201;
  $206 = $9;
  $207 = $206;
  $208 = HEAP32[$207>>2]|0;
  $209 = (($206) + 4)|0;
  $210 = $209;
  $211 = HEAP32[$210>>2]|0;
  $212 = (___muldi3(($208|0),($211|0),10,0)|0);
  $213 = tempRet0;
  $214 = $9;
  $215 = $214;
  HEAP32[$215>>2] = $212;
  $216 = (($214) + 4)|0;
  $217 = $216;
  HEAP32[$217>>2] = $213;
  $218 = $16;
  $219 = $218;
  $220 = HEAP32[$219>>2]|0;
  $221 = (($218) + 4)|0;
  $222 = $221;
  $223 = HEAP32[$222>>2]|0;
  $224 = ((($13)) + 8|0);
  $225 = HEAP32[$224>>2]|0;
  $226 = (0 - ($225))|0;
  $227 = (_bitshift64Lshr(($220|0),($223|0),($226|0))|0);
  $228 = tempRet0;
  $229 = $227&255;
  $20 = $229;
  $230 = $20;
  $231 = ($230<<24>>24)!=(0);
  if ($231) {
   label = 20;
  } else {
   $232 = $11;
   $233 = HEAP32[$232>>2]|0;
   $234 = ($233|0)!=(0);
   if ($234) {
    label = 20;
   }
  }
  if ((label|0) == 20) {
   label = 0;
   $235 = $20;
   $236 = $235 << 24 >> 24;
   $237 = (48 + ($236))|0;
   $238 = $237&255;
   $239 = $10;
   $240 = $11;
   $241 = HEAP32[$240>>2]|0;
   $242 = (($241) + 1)|0;
   HEAP32[$240>>2] = $242;
   $243 = (($239) + ($241)|0);
   HEAP8[$243>>0] = $238;
  }
  $244 = $13;
  $245 = $244;
  $246 = HEAP32[$245>>2]|0;
  $247 = (($244) + 4)|0;
  $248 = $247;
  $249 = HEAP32[$248>>2]|0;
  $250 = (_i64Subtract(($246|0),($249|0),1,0)|0);
  $251 = tempRet0;
  $252 = $16;
  $253 = $252;
  $254 = HEAP32[$253>>2]|0;
  $255 = (($252) + 4)|0;
  $256 = $255;
  $257 = HEAP32[$256>>2]|0;
  $258 = $254 & $250;
  $259 = $257 & $251;
  $260 = $16;
  $261 = $260;
  HEAP32[$261>>2] = $258;
  $262 = (($260) + 4)|0;
  $263 = $262;
  HEAP32[$263>>2] = $259;
  $264 = $17;
  $265 = (($264) + -1)|0;
  $17 = $265;
  $266 = $16;
  $267 = $266;
  $268 = HEAP32[$267>>2]|0;
  $269 = (($266) + 4)|0;
  $270 = $269;
  $271 = HEAP32[$270>>2]|0;
  $272 = $9;
  $273 = $272;
  $274 = HEAP32[$273>>2]|0;
  $275 = (($272) + 4)|0;
  $276 = $275;
  $277 = HEAP32[$276>>2]|0;
  $278 = ($271>>>0)<($277>>>0);
  $279 = ($268>>>0)<($274>>>0);
  $280 = ($271|0)==($277|0);
  $281 = $280 & $279;
  $282 = $278 | $281;
  if ($282) {
   break;
  }
 }
 $283 = $17;
 $284 = $12;
 $285 = HEAP32[$284>>2]|0;
 $286 = (($285) + ($283))|0;
 HEAP32[$284>>2] = $286;
 $287 = $17;
 $288 = (0 - ($287))|0;
 $21 = $288;
 $289 = $10;
 $290 = $11;
 $291 = HEAP32[$290>>2]|0;
 $292 = $9;
 $293 = $292;
 $294 = HEAP32[$293>>2]|0;
 $295 = (($292) + 4)|0;
 $296 = $295;
 $297 = HEAP32[$296>>2]|0;
 $298 = $16;
 $299 = $298;
 $300 = HEAP32[$299>>2]|0;
 $301 = (($298) + 4)|0;
 $302 = $301;
 $303 = HEAP32[$302>>2]|0;
 $304 = $13;
 $305 = $304;
 $306 = HEAP32[$305>>2]|0;
 $307 = (($304) + 4)|0;
 $308 = $307;
 $309 = HEAP32[$308>>2]|0;
 $310 = $14;
 $311 = $310;
 $312 = HEAP32[$311>>2]|0;
 $313 = (($310) + 4)|0;
 $314 = $313;
 $315 = HEAP32[$314>>2]|0;
 $316 = $21;
 $317 = ($316|0)<(9);
 if ($317) {
  $318 = $21;
  $319 = (3688 + ($318<<2)|0);
  $320 = HEAP32[$319>>2]|0;
  $321 = $320;
 } else {
  $321 = 0;
 }
 $322 = (___muldi3(($312|0),($315|0),($321|0),0)|0);
 $323 = tempRet0;
 __ZN9rapidjson8internal10GrisuRoundEPciyyyy($289,$291,$294,$297,$300,$303,$306,$309,$322,$323);
 STACKTOP = sp;return;
}
function __ZN9rapidjson8internal5DiyFpC2Eyi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $5 = sp;
 $4 = $0;
 $7 = $5;
 $8 = $7;
 HEAP32[$8>>2] = $1;
 $9 = (($7) + 4)|0;
 $10 = $9;
 HEAP32[$10>>2] = $2;
 $6 = $3;
 $11 = $4;
 $12 = $5;
 $13 = $12;
 $14 = HEAP32[$13>>2]|0;
 $15 = (($12) + 4)|0;
 $16 = $15;
 $17 = HEAP32[$16>>2]|0;
 $18 = $11;
 $19 = $18;
 HEAP32[$19>>2] = $14;
 $20 = (($18) + 4)|0;
 $21 = $20;
 HEAP32[$21>>2] = $17;
 $22 = ((($11)) + 8|0);
 $23 = $6;
 HEAP32[$22>>2] = $23;
 STACKTOP = sp;return;
}
function __ZNK9rapidjson8internal5DiyFp17NormalizeBoundaryEv($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $1;
 $3 = $2;
 ;HEAP32[$0>>2]=HEAP32[$3>>2]|0;HEAP32[$0+4>>2]=HEAP32[$3+4>>2]|0;HEAP32[$0+8>>2]=HEAP32[$3+8>>2]|0;HEAP32[$0+12>>2]=HEAP32[$3+12>>2]|0;
 while(1) {
  $4 = $0;
  $5 = $4;
  $6 = HEAP32[$5>>2]|0;
  $7 = (($4) + 4)|0;
  $8 = $7;
  $9 = HEAP32[$8>>2]|0;
  $10 = $9 & 2097152;
  $11 = (0)!=(0);
  $12 = ($10|0)!=(0);
  $13 = $11 | $12;
  $14 = $13 ^ 1;
  $15 = $0;
  $16 = $15;
  $17 = HEAP32[$16>>2]|0;
  $18 = (($15) + 4)|0;
  $19 = $18;
  $20 = HEAP32[$19>>2]|0;
  if (!($14)) {
   break;
  }
  $21 = (_bitshift64Shl(($17|0),($20|0),1)|0);
  $22 = tempRet0;
  $23 = $0;
  $24 = $23;
  HEAP32[$24>>2] = $21;
  $25 = (($23) + 4)|0;
  $26 = $25;
  HEAP32[$26>>2] = $22;
  $27 = ((($0)) + 8|0);
  $28 = HEAP32[$27>>2]|0;
  $29 = (($28) + -1)|0;
  HEAP32[$27>>2] = $29;
 }
 $30 = (_bitshift64Shl(($17|0),($20|0),10)|0);
 $31 = tempRet0;
 $32 = $0;
 $33 = $32;
 HEAP32[$33>>2] = $30;
 $34 = (($32) + 4)|0;
 $35 = $34;
 HEAP32[$35>>2] = $31;
 $36 = ((($0)) + 8|0);
 $37 = HEAP32[$36>>2]|0;
 $38 = (($37) - 10)|0;
 $39 = ((($0)) + 8|0);
 HEAP32[$39>>2] = $38;
 STACKTOP = sp;return;
}
function __ZN9rapidjson8internal21GetCachedPowerByIndexEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $1;
 $3 = $2;
 $4 = (2480 + ($3<<3)|0);
 $5 = $4;
 $6 = $5;
 $7 = HEAP32[$6>>2]|0;
 $8 = (($5) + 4)|0;
 $9 = $8;
 $10 = HEAP32[$9>>2]|0;
 $11 = $2;
 $12 = (4564 + ($11<<1)|0);
 $13 = HEAP16[$12>>1]|0;
 $14 = $13 << 16 >> 16;
 __ZN9rapidjson8internal5DiyFpC2Eyi($0,$7,$10,$14);
 STACKTOP = sp;return;
}
function __ZNK9rapidjson8internal5DiyFpmiERKS1_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = $5;
 $7 = $6;
 $8 = HEAP32[$7>>2]|0;
 $9 = (($6) + 4)|0;
 $10 = $9;
 $11 = HEAP32[$10>>2]|0;
 $12 = $4;
 $13 = $12;
 $14 = $13;
 $15 = HEAP32[$14>>2]|0;
 $16 = (($13) + 4)|0;
 $17 = $16;
 $18 = HEAP32[$17>>2]|0;
 $19 = (_i64Subtract(($8|0),($11|0),($15|0),($18|0))|0);
 $20 = tempRet0;
 $21 = ((($5)) + 8|0);
 $22 = HEAP32[$21>>2]|0;
 __ZN9rapidjson8internal5DiyFpC2Eyi($0,$19,$20,$22);
 STACKTOP = sp;return;
}
function __ZN9rapidjson8internal19CountDecimalDigit32Ej($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $2;
 $4 = ($3>>>0)<(10);
 do {
  if ($4) {
   $1 = 1;
  } else {
   $5 = $2;
   $6 = ($5>>>0)<(100);
   if ($6) {
    $1 = 2;
    break;
   }
   $7 = $2;
   $8 = ($7>>>0)<(1000);
   if ($8) {
    $1 = 3;
    break;
   }
   $9 = $2;
   $10 = ($9>>>0)<(10000);
   if ($10) {
    $1 = 4;
    break;
   }
   $11 = $2;
   $12 = ($11>>>0)<(100000);
   if ($12) {
    $1 = 5;
    break;
   }
   $13 = $2;
   $14 = ($13>>>0)<(1000000);
   if ($14) {
    $1 = 6;
    break;
   }
   $15 = $2;
   $16 = ($15>>>0)<(10000000);
   if ($16) {
    $1 = 7;
    break;
   }
   $17 = $2;
   $18 = ($17>>>0)<(100000000);
   if ($18) {
    $1 = 8;
    break;
   } else {
    $1 = 9;
    break;
   }
  }
 } while(0);
 $19 = $1;
 STACKTOP = sp;return ($19|0);
}
function __ZN9rapidjson8internal10GrisuRoundEPciyyyy($0,$1,$2,$3,$4,$5,$6,$7,$8,$9) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 $7 = $7|0;
 $8 = $8|0;
 $9 = $9|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0;
 var $86 = 0, $87 = 0, $88 = 0, $89 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $12 = sp + 24|0;
 $13 = sp + 16|0;
 $14 = sp + 8|0;
 $15 = sp;
 $10 = $0;
 $11 = $1;
 $16 = $12;
 $17 = $16;
 HEAP32[$17>>2] = $2;
 $18 = (($16) + 4)|0;
 $19 = $18;
 HEAP32[$19>>2] = $3;
 $20 = $13;
 $21 = $20;
 HEAP32[$21>>2] = $4;
 $22 = (($20) + 4)|0;
 $23 = $22;
 HEAP32[$23>>2] = $5;
 $24 = $14;
 $25 = $24;
 HEAP32[$25>>2] = $6;
 $26 = (($24) + 4)|0;
 $27 = $26;
 HEAP32[$27>>2] = $7;
 $28 = $15;
 $29 = $28;
 HEAP32[$29>>2] = $8;
 $30 = (($28) + 4)|0;
 $31 = $30;
 HEAP32[$31>>2] = $9;
 while(1) {
  $32 = $13;
  $33 = $32;
  $34 = HEAP32[$33>>2]|0;
  $35 = (($32) + 4)|0;
  $36 = $35;
  $37 = HEAP32[$36>>2]|0;
  $38 = $15;
  $39 = $38;
  $40 = HEAP32[$39>>2]|0;
  $41 = (($38) + 4)|0;
  $42 = $41;
  $43 = HEAP32[$42>>2]|0;
  $44 = ($37>>>0)<($43>>>0);
  $45 = ($34>>>0)<($40>>>0);
  $46 = ($37|0)==($43|0);
  $47 = $46 & $45;
  $48 = $44 | $47;
  if (!($48)) {
   label = 7;
   break;
  }
  $49 = $12;
  $50 = $49;
  $51 = HEAP32[$50>>2]|0;
  $52 = (($49) + 4)|0;
  $53 = $52;
  $54 = HEAP32[$53>>2]|0;
  $55 = $13;
  $56 = $55;
  $57 = HEAP32[$56>>2]|0;
  $58 = (($55) + 4)|0;
  $59 = $58;
  $60 = HEAP32[$59>>2]|0;
  $61 = (_i64Subtract(($51|0),($54|0),($57|0),($60|0))|0);
  $62 = tempRet0;
  $63 = $14;
  $64 = $63;
  $65 = HEAP32[$64>>2]|0;
  $66 = (($63) + 4)|0;
  $67 = $66;
  $68 = HEAP32[$67>>2]|0;
  $69 = ($62>>>0)>($68>>>0);
  $70 = ($61>>>0)>=($65>>>0);
  $71 = ($62|0)==($68|0);
  $72 = $71 & $70;
  $73 = $69 | $72;
  if (!($73)) {
   label = 7;
   break;
  }
  $74 = $13;
  $75 = $74;
  $76 = HEAP32[$75>>2]|0;
  $77 = (($74) + 4)|0;
  $78 = $77;
  $79 = HEAP32[$78>>2]|0;
  $80 = $14;
  $81 = $80;
  $82 = HEAP32[$81>>2]|0;
  $83 = (($80) + 4)|0;
  $84 = $83;
  $85 = HEAP32[$84>>2]|0;
  $86 = (_i64Add(($76|0),($79|0),($82|0),($85|0))|0);
  $87 = tempRet0;
  $88 = $15;
  $89 = $88;
  $90 = HEAP32[$89>>2]|0;
  $91 = (($88) + 4)|0;
  $92 = $91;
  $93 = HEAP32[$92>>2]|0;
  $94 = ($87>>>0)<($93>>>0);
  $95 = ($86>>>0)<($90>>>0);
  $96 = ($87|0)==($93|0);
  $97 = $96 & $95;
  $98 = $94 | $97;
  if (!($98)) {
   $99 = $15;
   $100 = $99;
   $101 = HEAP32[$100>>2]|0;
   $102 = (($99) + 4)|0;
   $103 = $102;
   $104 = HEAP32[$103>>2]|0;
   $105 = $13;
   $106 = $105;
   $107 = HEAP32[$106>>2]|0;
   $108 = (($105) + 4)|0;
   $109 = $108;
   $110 = HEAP32[$109>>2]|0;
   $111 = (_i64Subtract(($101|0),($104|0),($107|0),($110|0))|0);
   $112 = tempRet0;
   $113 = $13;
   $114 = $113;
   $115 = HEAP32[$114>>2]|0;
   $116 = (($113) + 4)|0;
   $117 = $116;
   $118 = HEAP32[$117>>2]|0;
   $119 = $14;
   $120 = $119;
   $121 = HEAP32[$120>>2]|0;
   $122 = (($119) + 4)|0;
   $123 = $122;
   $124 = HEAP32[$123>>2]|0;
   $125 = (_i64Add(($115|0),($118|0),($121|0),($124|0))|0);
   $126 = tempRet0;
   $127 = $15;
   $128 = $127;
   $129 = HEAP32[$128>>2]|0;
   $130 = (($127) + 4)|0;
   $131 = $130;
   $132 = HEAP32[$131>>2]|0;
   $133 = (_i64Subtract(($125|0),($126|0),($129|0),($132|0))|0);
   $134 = tempRet0;
   $135 = ($112>>>0)>($134>>>0);
   $136 = ($111>>>0)>($133>>>0);
   $137 = ($112|0)==($134|0);
   $138 = $137 & $136;
   $139 = $135 | $138;
   if (!($139)) {
    label = 7;
    break;
   }
  }
  $140 = $10;
  $141 = $11;
  $142 = (($141) - 1)|0;
  $143 = (($140) + ($142)|0);
  $144 = HEAP8[$143>>0]|0;
  $145 = (($144) + -1)<<24>>24;
  HEAP8[$143>>0] = $145;
  $146 = $14;
  $147 = $146;
  $148 = HEAP32[$147>>2]|0;
  $149 = (($146) + 4)|0;
  $150 = $149;
  $151 = HEAP32[$150>>2]|0;
  $152 = $13;
  $153 = $152;
  $154 = HEAP32[$153>>2]|0;
  $155 = (($152) + 4)|0;
  $156 = $155;
  $157 = HEAP32[$156>>2]|0;
  $158 = (_i64Add(($154|0),($157|0),($148|0),($151|0))|0);
  $159 = tempRet0;
  $160 = $13;
  $161 = $160;
  HEAP32[$161>>2] = $158;
  $162 = (($160) + 4)|0;
  $163 = $162;
  HEAP32[$163>>2] = $159;
 }
 if ((label|0) == 7) {
  STACKTOP = sp;return;
 }
}
function __ZN9rapidjson8internal13WriteExponentEiPc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $6 = $2;
 $7 = ($6|0)<(0);
 if ($7) {
  $8 = $3;
  $9 = ((($8)) + 1|0);
  $3 = $9;
  HEAP8[$8>>0] = 45;
  $10 = $2;
  $11 = (0 - ($10))|0;
  $2 = $11;
 }
 $12 = $2;
 $13 = ($12|0)>=(100);
 $14 = $2;
 if ($13) {
  $15 = (($14|0) / 100)&-1;
  $16 = $15&255;
  $17 = $16 << 24 >> 24;
  $18 = (48 + ($17))|0;
  $19 = $18&255;
  $20 = $3;
  $21 = ((($20)) + 1|0);
  $3 = $21;
  HEAP8[$20>>0] = $19;
  $22 = $2;
  $23 = (($22|0) % 100)&-1;
  $2 = $23;
  $24 = (__ZN9rapidjson8internal12GetDigitsLutEv()|0);
  $25 = $2;
  $26 = $25<<1;
  $27 = (($24) + ($26)|0);
  $4 = $27;
  $28 = $4;
  $29 = HEAP8[$28>>0]|0;
  $30 = $3;
  $31 = ((($30)) + 1|0);
  $3 = $31;
  HEAP8[$30>>0] = $29;
  $32 = $4;
  $33 = ((($32)) + 1|0);
  $34 = HEAP8[$33>>0]|0;
  $35 = $3;
  $36 = ((($35)) + 1|0);
  $3 = $36;
  HEAP8[$35>>0] = $34;
  $58 = $3;
  STACKTOP = sp;return ($58|0);
 }
 $37 = ($14|0)>=(10);
 if ($37) {
  $38 = (__ZN9rapidjson8internal12GetDigitsLutEv()|0);
  $39 = $2;
  $40 = $39<<1;
  $41 = (($38) + ($40)|0);
  $5 = $41;
  $42 = $5;
  $43 = HEAP8[$42>>0]|0;
  $44 = $3;
  $45 = ((($44)) + 1|0);
  $3 = $45;
  HEAP8[$44>>0] = $43;
  $46 = $5;
  $47 = ((($46)) + 1|0);
  $48 = HEAP8[$47>>0]|0;
  $49 = $3;
  $50 = ((($49)) + 1|0);
  $3 = $50;
  HEAP8[$49>>0] = $48;
  $58 = $3;
  STACKTOP = sp;return ($58|0);
 } else {
  $51 = $2;
  $52 = $51&255;
  $53 = $52 << 24 >> 24;
  $54 = (48 + ($53))|0;
  $55 = $54&255;
  $56 = $3;
  $57 = ((($56)) + 1|0);
  $3 = $57;
  HEAP8[$56>>0] = $55;
  $58 = $3;
  STACKTOP = sp;return ($58|0);
 }
 return (0)|0;
}
function __ZN9rapidjson8internal12GetDigitsLutEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (6772|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE8WriteIntEi($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $6 = $2;
 $7 = HEAP32[$6>>2]|0;
 $8 = (__ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE4PushEj($7,11)|0);
 $4 = $8;
 $9 = $3;
 $10 = $4;
 $11 = (__ZN9rapidjson8internal6i32toaEiPc($9,$10)|0);
 $5 = $11;
 $12 = HEAP32[$6>>2]|0;
 $13 = $5;
 $14 = $4;
 $15 = $13;
 $16 = $14;
 $17 = (($15) - ($16))|0;
 $18 = (11 - ($17))|0;
 __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE3PopEj($12,$18);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson8internal6i32toaEiPc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $5 = $2;
 $4 = $5;
 $6 = $2;
 $7 = ($6|0)<(0);
 if ($7) {
  $8 = $3;
  $9 = ((($8)) + 1|0);
  $3 = $9;
  HEAP8[$8>>0] = 45;
  $10 = $4;
  $11 = $10 ^ -1;
  $12 = (($11) + 1)|0;
  $4 = $12;
 }
 $13 = $4;
 $14 = $3;
 $15 = (__ZN9rapidjson8internal6u32toaEjPc($13,$14)|0);
 STACKTOP = sp;return ($15|0);
}
function __ZN9rapidjson8internal6u32toaEjPc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0;
 var $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0;
 var $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0;
 var $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0;
 var $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0;
 var $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0;
 var $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $2 = $0;
 $3 = $1;
 $21 = (__ZN9rapidjson8internal12GetDigitsLutEv()|0);
 $4 = $21;
 $22 = $2;
 $23 = ($22>>>0)<(10000);
 $24 = $2;
 if ($23) {
  $25 = (($24>>>0) / 100)&-1;
  $26 = $25 << 1;
  $5 = $26;
  $27 = $2;
  $28 = (($27>>>0) % 100)&-1;
  $29 = $28 << 1;
  $6 = $29;
  $30 = $2;
  $31 = ($30>>>0)>=(1000);
  if ($31) {
   $32 = $4;
   $33 = $5;
   $34 = (($32) + ($33)|0);
   $35 = HEAP8[$34>>0]|0;
   $36 = $3;
   $37 = ((($36)) + 1|0);
   $3 = $37;
   HEAP8[$36>>0] = $35;
  }
  $38 = $2;
  $39 = ($38>>>0)>=(100);
  if ($39) {
   $40 = $4;
   $41 = $5;
   $42 = (($41) + 1)|0;
   $43 = (($40) + ($42)|0);
   $44 = HEAP8[$43>>0]|0;
   $45 = $3;
   $46 = ((($45)) + 1|0);
   $3 = $46;
   HEAP8[$45>>0] = $44;
  }
  $47 = $2;
  $48 = ($47>>>0)>=(10);
  if ($48) {
   $49 = $4;
   $50 = $6;
   $51 = (($49) + ($50)|0);
   $52 = HEAP8[$51>>0]|0;
   $53 = $3;
   $54 = ((($53)) + 1|0);
   $3 = $54;
   HEAP8[$53>>0] = $52;
  }
  $55 = $4;
  $56 = $6;
  $57 = (($56) + 1)|0;
  $58 = (($55) + ($57)|0);
  $59 = HEAP8[$58>>0]|0;
  $60 = $3;
  $61 = ((($60)) + 1|0);
  $3 = $61;
  HEAP8[$60>>0] = $59;
  $231 = $3;
  STACKTOP = sp;return ($231|0);
 }
 $62 = ($24>>>0)<(100000000);
 $63 = $2;
 if (!($62)) {
  $137 = (($63>>>0) / 100000000)&-1;
  $13 = $137;
  $138 = $2;
  $139 = (($138>>>0) % 100000000)&-1;
  $2 = $139;
  $140 = $13;
  $141 = ($140>>>0)>=(10);
  $142 = $13;
  if ($141) {
   $143 = $142 << 1;
   $14 = $143;
   $144 = $4;
   $145 = $14;
   $146 = (($144) + ($145)|0);
   $147 = HEAP8[$146>>0]|0;
   $148 = $3;
   $149 = ((($148)) + 1|0);
   $3 = $149;
   HEAP8[$148>>0] = $147;
   $150 = $4;
   $151 = $14;
   $152 = (($151) + 1)|0;
   $153 = (($150) + ($152)|0);
   $154 = HEAP8[$153>>0]|0;
   $155 = $3;
   $156 = ((($155)) + 1|0);
   $3 = $156;
   HEAP8[$155>>0] = $154;
  } else {
   $157 = $142&255;
   $158 = $157 << 24 >> 24;
   $159 = (48 + ($158))|0;
   $160 = $159&255;
   $161 = $3;
   $162 = ((($161)) + 1|0);
   $3 = $162;
   HEAP8[$161>>0] = $160;
  }
  $163 = $2;
  $164 = (($163>>>0) / 10000)&-1;
  $15 = $164;
  $165 = $2;
  $166 = (($165>>>0) % 10000)&-1;
  $16 = $166;
  $167 = $15;
  $168 = (($167>>>0) / 100)&-1;
  $169 = $168 << 1;
  $17 = $169;
  $170 = $15;
  $171 = (($170>>>0) % 100)&-1;
  $172 = $171 << 1;
  $18 = $172;
  $173 = $16;
  $174 = (($173>>>0) / 100)&-1;
  $175 = $174 << 1;
  $19 = $175;
  $176 = $16;
  $177 = (($176>>>0) % 100)&-1;
  $178 = $177 << 1;
  $20 = $178;
  $179 = $4;
  $180 = $17;
  $181 = (($179) + ($180)|0);
  $182 = HEAP8[$181>>0]|0;
  $183 = $3;
  $184 = ((($183)) + 1|0);
  $3 = $184;
  HEAP8[$183>>0] = $182;
  $185 = $4;
  $186 = $17;
  $187 = (($186) + 1)|0;
  $188 = (($185) + ($187)|0);
  $189 = HEAP8[$188>>0]|0;
  $190 = $3;
  $191 = ((($190)) + 1|0);
  $3 = $191;
  HEAP8[$190>>0] = $189;
  $192 = $4;
  $193 = $18;
  $194 = (($192) + ($193)|0);
  $195 = HEAP8[$194>>0]|0;
  $196 = $3;
  $197 = ((($196)) + 1|0);
  $3 = $197;
  HEAP8[$196>>0] = $195;
  $198 = $4;
  $199 = $18;
  $200 = (($199) + 1)|0;
  $201 = (($198) + ($200)|0);
  $202 = HEAP8[$201>>0]|0;
  $203 = $3;
  $204 = ((($203)) + 1|0);
  $3 = $204;
  HEAP8[$203>>0] = $202;
  $205 = $4;
  $206 = $19;
  $207 = (($205) + ($206)|0);
  $208 = HEAP8[$207>>0]|0;
  $209 = $3;
  $210 = ((($209)) + 1|0);
  $3 = $210;
  HEAP8[$209>>0] = $208;
  $211 = $4;
  $212 = $19;
  $213 = (($212) + 1)|0;
  $214 = (($211) + ($213)|0);
  $215 = HEAP8[$214>>0]|0;
  $216 = $3;
  $217 = ((($216)) + 1|0);
  $3 = $217;
  HEAP8[$216>>0] = $215;
  $218 = $4;
  $219 = $20;
  $220 = (($218) + ($219)|0);
  $221 = HEAP8[$220>>0]|0;
  $222 = $3;
  $223 = ((($222)) + 1|0);
  $3 = $223;
  HEAP8[$222>>0] = $221;
  $224 = $4;
  $225 = $20;
  $226 = (($225) + 1)|0;
  $227 = (($224) + ($226)|0);
  $228 = HEAP8[$227>>0]|0;
  $229 = $3;
  $230 = ((($229)) + 1|0);
  $3 = $230;
  HEAP8[$229>>0] = $228;
  $231 = $3;
  STACKTOP = sp;return ($231|0);
 }
 $64 = (($63>>>0) / 10000)&-1;
 $7 = $64;
 $65 = $2;
 $66 = (($65>>>0) % 10000)&-1;
 $8 = $66;
 $67 = $7;
 $68 = (($67>>>0) / 100)&-1;
 $69 = $68 << 1;
 $9 = $69;
 $70 = $7;
 $71 = (($70>>>0) % 100)&-1;
 $72 = $71 << 1;
 $10 = $72;
 $73 = $8;
 $74 = (($73>>>0) / 100)&-1;
 $75 = $74 << 1;
 $11 = $75;
 $76 = $8;
 $77 = (($76>>>0) % 100)&-1;
 $78 = $77 << 1;
 $12 = $78;
 $79 = $2;
 $80 = ($79>>>0)>=(10000000);
 if ($80) {
  $81 = $4;
  $82 = $9;
  $83 = (($81) + ($82)|0);
  $84 = HEAP8[$83>>0]|0;
  $85 = $3;
  $86 = ((($85)) + 1|0);
  $3 = $86;
  HEAP8[$85>>0] = $84;
 }
 $87 = $2;
 $88 = ($87>>>0)>=(1000000);
 if ($88) {
  $89 = $4;
  $90 = $9;
  $91 = (($90) + 1)|0;
  $92 = (($89) + ($91)|0);
  $93 = HEAP8[$92>>0]|0;
  $94 = $3;
  $95 = ((($94)) + 1|0);
  $3 = $95;
  HEAP8[$94>>0] = $93;
 }
 $96 = $2;
 $97 = ($96>>>0)>=(100000);
 if ($97) {
  $98 = $4;
  $99 = $10;
  $100 = (($98) + ($99)|0);
  $101 = HEAP8[$100>>0]|0;
  $102 = $3;
  $103 = ((($102)) + 1|0);
  $3 = $103;
  HEAP8[$102>>0] = $101;
 }
 $104 = $4;
 $105 = $10;
 $106 = (($105) + 1)|0;
 $107 = (($104) + ($106)|0);
 $108 = HEAP8[$107>>0]|0;
 $109 = $3;
 $110 = ((($109)) + 1|0);
 $3 = $110;
 HEAP8[$109>>0] = $108;
 $111 = $4;
 $112 = $11;
 $113 = (($111) + ($112)|0);
 $114 = HEAP8[$113>>0]|0;
 $115 = $3;
 $116 = ((($115)) + 1|0);
 $3 = $116;
 HEAP8[$115>>0] = $114;
 $117 = $4;
 $118 = $11;
 $119 = (($118) + 1)|0;
 $120 = (($117) + ($119)|0);
 $121 = HEAP8[$120>>0]|0;
 $122 = $3;
 $123 = ((($122)) + 1|0);
 $3 = $123;
 HEAP8[$122>>0] = $121;
 $124 = $4;
 $125 = $12;
 $126 = (($124) + ($125)|0);
 $127 = HEAP8[$126>>0]|0;
 $128 = $3;
 $129 = ((($128)) + 1|0);
 $3 = $129;
 HEAP8[$128>>0] = $127;
 $130 = $4;
 $131 = $12;
 $132 = (($131) + 1)|0;
 $133 = (($130) + ($132)|0);
 $134 = HEAP8[$133>>0]|0;
 $135 = $3;
 $136 = ((($135)) + 1|0);
 $3 = $136;
 HEAP8[$135>>0] = $134;
 $231 = $3;
 STACKTOP = sp;return ($231|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE9WriteUintEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $6 = $2;
 $7 = HEAP32[$6>>2]|0;
 $8 = (__ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE4PushEj($7,10)|0);
 $4 = $8;
 $9 = $3;
 $10 = $4;
 $11 = (__ZN9rapidjson8internal6u32toaEjPc($9,$10)|0);
 $5 = $11;
 $12 = HEAP32[$6>>2]|0;
 $13 = $5;
 $14 = $4;
 $15 = $13;
 $16 = $14;
 $17 = (($15) - ($16))|0;
 $18 = (10 - ($17))|0;
 __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE3PopEj($12,$18);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE10WriteInt64Ex($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $3 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = sp;
 $3 = $0;
 $7 = $4;
 $8 = $7;
 HEAP32[$8>>2] = $1;
 $9 = (($7) + 4)|0;
 $10 = $9;
 HEAP32[$10>>2] = $2;
 $11 = $3;
 $12 = HEAP32[$11>>2]|0;
 $13 = (__ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE4PushEj($12,21)|0);
 $5 = $13;
 $14 = $4;
 $15 = $14;
 $16 = HEAP32[$15>>2]|0;
 $17 = (($14) + 4)|0;
 $18 = $17;
 $19 = HEAP32[$18>>2]|0;
 $20 = $5;
 $21 = (__ZN9rapidjson8internal6i64toaExPc($16,$19,$20)|0);
 $6 = $21;
 $22 = HEAP32[$11>>2]|0;
 $23 = $6;
 $24 = $5;
 $25 = $23;
 $26 = $24;
 $27 = (($25) - ($26))|0;
 $28 = (21 - ($27))|0;
 __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE3PopEj($22,$28);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson8internal6i64toaExPc($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $3 = sp + 8|0;
 $5 = sp;
 $6 = $3;
 $7 = $6;
 HEAP32[$7>>2] = $0;
 $8 = (($6) + 4)|0;
 $9 = $8;
 HEAP32[$9>>2] = $1;
 $4 = $2;
 $10 = $3;
 $11 = $10;
 $12 = HEAP32[$11>>2]|0;
 $13 = (($10) + 4)|0;
 $14 = $13;
 $15 = HEAP32[$14>>2]|0;
 $16 = $5;
 $17 = $16;
 HEAP32[$17>>2] = $12;
 $18 = (($16) + 4)|0;
 $19 = $18;
 HEAP32[$19>>2] = $15;
 $20 = $3;
 $21 = $20;
 $22 = HEAP32[$21>>2]|0;
 $23 = (($20) + 4)|0;
 $24 = $23;
 $25 = HEAP32[$24>>2]|0;
 $26 = ($25|0)<(0);
 if ($26) {
  $27 = $4;
  $28 = ((($27)) + 1|0);
  $4 = $28;
  HEAP8[$27>>0] = 45;
  $29 = $5;
  $30 = $29;
  $31 = HEAP32[$30>>2]|0;
  $32 = (($29) + 4)|0;
  $33 = $32;
  $34 = HEAP32[$33>>2]|0;
  $35 = $31 ^ -1;
  $36 = $34 ^ -1;
  $37 = (_i64Add(($35|0),($36|0),1,0)|0);
  $38 = tempRet0;
  $39 = $5;
  $40 = $39;
  HEAP32[$40>>2] = $37;
  $41 = (($39) + 4)|0;
  $42 = $41;
  HEAP32[$42>>2] = $38;
 }
 $43 = $5;
 $44 = $43;
 $45 = HEAP32[$44>>2]|0;
 $46 = (($43) + 4)|0;
 $47 = $46;
 $48 = HEAP32[$47>>2]|0;
 $49 = $4;
 $50 = (__ZN9rapidjson8internal6u64toaEyPc($45,$48,$49)|0);
 STACKTOP = sp;return ($50|0);
}
function __ZN9rapidjson8internal6u64toaEyPc($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0;
 var $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0;
 var $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0;
 var $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0;
 var $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0;
 var $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0;
 var $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0;
 var $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0;
 var $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0;
 var $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0;
 var $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0;
 var $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0;
 var $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0;
 var $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0;
 var $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0;
 var $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0;
 var $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0;
 var $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0;
 var $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0;
 var $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0;
 var $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0;
 var $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0;
 var $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0;
 var $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0;
 var $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0;
 var $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0;
 var $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0;
 var $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0;
 var $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0;
 var $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0;
 var $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0;
 var $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(256|0);
 $3 = sp + 72|0;
 $6 = sp + 64|0;
 $7 = sp + 56|0;
 $8 = sp + 48|0;
 $9 = sp + 40|0;
 $10 = sp + 32|0;
 $11 = sp + 24|0;
 $12 = sp + 16|0;
 $13 = sp + 8|0;
 $14 = sp;
 $57 = $3;
 $58 = $57;
 HEAP32[$58>>2] = $0;
 $59 = (($57) + 4)|0;
 $60 = $59;
 HEAP32[$60>>2] = $1;
 $4 = $2;
 $61 = (__ZN9rapidjson8internal12GetDigitsLutEv()|0);
 $5 = $61;
 $62 = $6;
 $63 = $62;
 HEAP32[$63>>2] = 100000000;
 $64 = (($62) + 4)|0;
 $65 = $64;
 HEAP32[$65>>2] = 0;
 $66 = $7;
 $67 = $66;
 HEAP32[$67>>2] = 1000000000;
 $68 = (($66) + 4)|0;
 $69 = $68;
 HEAP32[$69>>2] = 0;
 $70 = $8;
 $71 = $70;
 HEAP32[$71>>2] = 1410065408;
 $72 = (($70) + 4)|0;
 $73 = $72;
 HEAP32[$73>>2] = 2;
 $74 = $9;
 $75 = $74;
 HEAP32[$75>>2] = 1215752192;
 $76 = (($74) + 4)|0;
 $77 = $76;
 HEAP32[$77>>2] = 23;
 $78 = $10;
 $79 = $78;
 HEAP32[$79>>2] = -727379968;
 $80 = (($78) + 4)|0;
 $81 = $80;
 HEAP32[$81>>2] = 232;
 $82 = $11;
 $83 = $82;
 HEAP32[$83>>2] = 1316134912;
 $84 = (($82) + 4)|0;
 $85 = $84;
 HEAP32[$85>>2] = 2328;
 $86 = $12;
 $87 = $86;
 HEAP32[$87>>2] = 276447232;
 $88 = (($86) + 4)|0;
 $89 = $88;
 HEAP32[$89>>2] = 23283;
 $90 = $13;
 $91 = $90;
 HEAP32[$91>>2] = -1530494976;
 $92 = (($90) + 4)|0;
 $93 = $92;
 HEAP32[$93>>2] = 232830;
 $94 = $14;
 $95 = $94;
 HEAP32[$95>>2] = 1874919424;
 $96 = (($94) + 4)|0;
 $97 = $96;
 HEAP32[$97>>2] = 2328306;
 $98 = $3;
 $99 = $98;
 $100 = HEAP32[$99>>2]|0;
 $101 = (($98) + 4)|0;
 $102 = $101;
 $103 = HEAP32[$102>>2]|0;
 $104 = ($103>>>0)<(0);
 $105 = ($100>>>0)<(100000000);
 $106 = ($103|0)==(0);
 $107 = $106 & $105;
 $108 = $104 | $107;
 $109 = $3;
 $110 = $109;
 $111 = HEAP32[$110>>2]|0;
 $112 = (($109) + 4)|0;
 $113 = $112;
 $114 = HEAP32[$113>>2]|0;
 if ($108) {
  $15 = $111;
  $115 = $15;
  $116 = ($115>>>0)<(10000);
  $117 = $15;
  if ($116) {
   $118 = (($117>>>0) / 100)&-1;
   $119 = $118 << 1;
   $16 = $119;
   $120 = $15;
   $121 = (($120>>>0) % 100)&-1;
   $122 = $121 << 1;
   $17 = $122;
   $123 = $15;
   $124 = ($123>>>0)>=(1000);
   if ($124) {
    $125 = $5;
    $126 = $16;
    $127 = (($125) + ($126)|0);
    $128 = HEAP8[$127>>0]|0;
    $129 = $4;
    $130 = ((($129)) + 1|0);
    $4 = $130;
    HEAP8[$129>>0] = $128;
   }
   $131 = $15;
   $132 = ($131>>>0)>=(100);
   if ($132) {
    $133 = $5;
    $134 = $16;
    $135 = (($134) + 1)|0;
    $136 = (($133) + ($135)|0);
    $137 = HEAP8[$136>>0]|0;
    $138 = $4;
    $139 = ((($138)) + 1|0);
    $4 = $139;
    HEAP8[$138>>0] = $137;
   }
   $140 = $15;
   $141 = ($140>>>0)>=(10);
   if ($141) {
    $142 = $5;
    $143 = $17;
    $144 = (($142) + ($143)|0);
    $145 = HEAP8[$144>>0]|0;
    $146 = $4;
    $147 = ((($146)) + 1|0);
    $4 = $147;
    HEAP8[$146>>0] = $145;
   }
   $148 = $5;
   $149 = $17;
   $150 = (($149) + 1)|0;
   $151 = (($148) + ($150)|0);
   $152 = HEAP8[$151>>0]|0;
   $153 = $4;
   $154 = ((($153)) + 1|0);
   $4 = $154;
   HEAP8[$153>>0] = $152;
   $746 = $4;
   STACKTOP = sp;return ($746|0);
  } else {
   $155 = (($117>>>0) / 10000)&-1;
   $18 = $155;
   $156 = $15;
   $157 = (($156>>>0) % 10000)&-1;
   $19 = $157;
   $158 = $18;
   $159 = (($158>>>0) / 100)&-1;
   $160 = $159 << 1;
   $20 = $160;
   $161 = $18;
   $162 = (($161>>>0) % 100)&-1;
   $163 = $162 << 1;
   $21 = $163;
   $164 = $19;
   $165 = (($164>>>0) / 100)&-1;
   $166 = $165 << 1;
   $22 = $166;
   $167 = $19;
   $168 = (($167>>>0) % 100)&-1;
   $169 = $168 << 1;
   $23 = $169;
   $170 = $3;
   $171 = $170;
   $172 = HEAP32[$171>>2]|0;
   $173 = (($170) + 4)|0;
   $174 = $173;
   $175 = HEAP32[$174>>2]|0;
   $176 = ($175>>>0)>(0);
   $177 = ($172>>>0)>=(10000000);
   $178 = ($175|0)==(0);
   $179 = $178 & $177;
   $180 = $176 | $179;
   if ($180) {
    $181 = $5;
    $182 = $20;
    $183 = (($181) + ($182)|0);
    $184 = HEAP8[$183>>0]|0;
    $185 = $4;
    $186 = ((($185)) + 1|0);
    $4 = $186;
    HEAP8[$185>>0] = $184;
   }
   $187 = $3;
   $188 = $187;
   $189 = HEAP32[$188>>2]|0;
   $190 = (($187) + 4)|0;
   $191 = $190;
   $192 = HEAP32[$191>>2]|0;
   $193 = ($192>>>0)>(0);
   $194 = ($189>>>0)>=(1000000);
   $195 = ($192|0)==(0);
   $196 = $195 & $194;
   $197 = $193 | $196;
   if ($197) {
    $198 = $5;
    $199 = $20;
    $200 = (($199) + 1)|0;
    $201 = (($198) + ($200)|0);
    $202 = HEAP8[$201>>0]|0;
    $203 = $4;
    $204 = ((($203)) + 1|0);
    $4 = $204;
    HEAP8[$203>>0] = $202;
   }
   $205 = $3;
   $206 = $205;
   $207 = HEAP32[$206>>2]|0;
   $208 = (($205) + 4)|0;
   $209 = $208;
   $210 = HEAP32[$209>>2]|0;
   $211 = ($210>>>0)>(0);
   $212 = ($207>>>0)>=(100000);
   $213 = ($210|0)==(0);
   $214 = $213 & $212;
   $215 = $211 | $214;
   if ($215) {
    $216 = $5;
    $217 = $21;
    $218 = (($216) + ($217)|0);
    $219 = HEAP8[$218>>0]|0;
    $220 = $4;
    $221 = ((($220)) + 1|0);
    $4 = $221;
    HEAP8[$220>>0] = $219;
   }
   $222 = $5;
   $223 = $21;
   $224 = (($223) + 1)|0;
   $225 = (($222) + ($224)|0);
   $226 = HEAP8[$225>>0]|0;
   $227 = $4;
   $228 = ((($227)) + 1|0);
   $4 = $228;
   HEAP8[$227>>0] = $226;
   $229 = $5;
   $230 = $22;
   $231 = (($229) + ($230)|0);
   $232 = HEAP8[$231>>0]|0;
   $233 = $4;
   $234 = ((($233)) + 1|0);
   $4 = $234;
   HEAP8[$233>>0] = $232;
   $235 = $5;
   $236 = $22;
   $237 = (($236) + 1)|0;
   $238 = (($235) + ($237)|0);
   $239 = HEAP8[$238>>0]|0;
   $240 = $4;
   $241 = ((($240)) + 1|0);
   $4 = $241;
   HEAP8[$240>>0] = $239;
   $242 = $5;
   $243 = $23;
   $244 = (($242) + ($243)|0);
   $245 = HEAP8[$244>>0]|0;
   $246 = $4;
   $247 = ((($246)) + 1|0);
   $4 = $247;
   HEAP8[$246>>0] = $245;
   $248 = $5;
   $249 = $23;
   $250 = (($249) + 1)|0;
   $251 = (($248) + ($250)|0);
   $252 = HEAP8[$251>>0]|0;
   $253 = $4;
   $254 = ((($253)) + 1|0);
   $4 = $254;
   HEAP8[$253>>0] = $252;
   $746 = $4;
   STACKTOP = sp;return ($746|0);
  }
 }
 $255 = ($114>>>0)<(2328306);
 $256 = ($111>>>0)<(1874919424);
 $257 = ($114|0)==(2328306);
 $258 = $257 & $256;
 $259 = $255 | $258;
 $260 = $3;
 $261 = $260;
 $262 = HEAP32[$261>>2]|0;
 $263 = (($260) + 4)|0;
 $264 = $263;
 $265 = HEAP32[$264>>2]|0;
 if (!($259)) {
  $500 = (___udivdi3(($262|0),($265|0),1874919424,2328306)|0);
  $501 = tempRet0;
  $38 = $500;
  $502 = $3;
  $503 = $502;
  $504 = HEAP32[$503>>2]|0;
  $505 = (($502) + 4)|0;
  $506 = $505;
  $507 = HEAP32[$506>>2]|0;
  $508 = (___uremdi3(($504|0),($507|0),1874919424,2328306)|0);
  $509 = tempRet0;
  $510 = $3;
  $511 = $510;
  HEAP32[$511>>2] = $508;
  $512 = (($510) + 4)|0;
  $513 = $512;
  HEAP32[$513>>2] = $509;
  $514 = $38;
  $515 = ($514>>>0)<(10);
  $516 = $38;
  do {
   if ($515) {
    $517 = $516&255;
    $518 = $517 << 24 >> 24;
    $519 = (48 + ($518))|0;
    $520 = $519&255;
    $521 = $4;
    $522 = ((($521)) + 1|0);
    $4 = $522;
    HEAP8[$521>>0] = $520;
   } else {
    $523 = ($516>>>0)<(100);
    $524 = $38;
    if ($523) {
     $525 = $524 << 1;
     $39 = $525;
     $526 = $5;
     $527 = $39;
     $528 = (($526) + ($527)|0);
     $529 = HEAP8[$528>>0]|0;
     $530 = $4;
     $531 = ((($530)) + 1|0);
     $4 = $531;
     HEAP8[$530>>0] = $529;
     $532 = $5;
     $533 = $39;
     $534 = (($533) + 1)|0;
     $535 = (($532) + ($534)|0);
     $536 = HEAP8[$535>>0]|0;
     $537 = $4;
     $538 = ((($537)) + 1|0);
     $4 = $538;
     HEAP8[$537>>0] = $536;
     break;
    }
    $539 = ($524>>>0)<(1000);
    $540 = $38;
    $541 = (($540>>>0) / 100)&-1;
    if ($539) {
     $542 = $541&255;
     $543 = $542 << 24 >> 24;
     $544 = (48 + ($543))|0;
     $545 = $544&255;
     $546 = $4;
     $547 = ((($546)) + 1|0);
     $4 = $547;
     HEAP8[$546>>0] = $545;
     $548 = $38;
     $549 = (($548>>>0) % 100)&-1;
     $550 = $549 << 1;
     $40 = $550;
     $551 = $5;
     $552 = $40;
     $553 = (($551) + ($552)|0);
     $554 = HEAP8[$553>>0]|0;
     $555 = $4;
     $556 = ((($555)) + 1|0);
     $4 = $556;
     HEAP8[$555>>0] = $554;
     $557 = $5;
     $558 = $40;
     $559 = (($558) + 1)|0;
     $560 = (($557) + ($559)|0);
     $561 = HEAP8[$560>>0]|0;
     $562 = $4;
     $563 = ((($562)) + 1|0);
     $4 = $563;
     HEAP8[$562>>0] = $561;
     break;
    } else {
     $564 = $541 << 1;
     $41 = $564;
     $565 = $38;
     $566 = (($565>>>0) % 100)&-1;
     $567 = $566 << 1;
     $42 = $567;
     $568 = $5;
     $569 = $41;
     $570 = (($568) + ($569)|0);
     $571 = HEAP8[$570>>0]|0;
     $572 = $4;
     $573 = ((($572)) + 1|0);
     $4 = $573;
     HEAP8[$572>>0] = $571;
     $574 = $5;
     $575 = $41;
     $576 = (($575) + 1)|0;
     $577 = (($574) + ($576)|0);
     $578 = HEAP8[$577>>0]|0;
     $579 = $4;
     $580 = ((($579)) + 1|0);
     $4 = $580;
     HEAP8[$579>>0] = $578;
     $581 = $5;
     $582 = $42;
     $583 = (($581) + ($582)|0);
     $584 = HEAP8[$583>>0]|0;
     $585 = $4;
     $586 = ((($585)) + 1|0);
     $4 = $586;
     HEAP8[$585>>0] = $584;
     $587 = $5;
     $588 = $42;
     $589 = (($588) + 1)|0;
     $590 = (($587) + ($589)|0);
     $591 = HEAP8[$590>>0]|0;
     $592 = $4;
     $593 = ((($592)) + 1|0);
     $4 = $593;
     HEAP8[$592>>0] = $591;
     break;
    }
   }
  } while(0);
  $594 = $3;
  $595 = $594;
  $596 = HEAP32[$595>>2]|0;
  $597 = (($594) + 4)|0;
  $598 = $597;
  $599 = HEAP32[$598>>2]|0;
  $600 = (___udivdi3(($596|0),($599|0),100000000,0)|0);
  $601 = tempRet0;
  $43 = $600;
  $602 = $3;
  $603 = $602;
  $604 = HEAP32[$603>>2]|0;
  $605 = (($602) + 4)|0;
  $606 = $605;
  $607 = HEAP32[$606>>2]|0;
  $608 = (___uremdi3(($604|0),($607|0),100000000,0)|0);
  $609 = tempRet0;
  $44 = $608;
  $610 = $43;
  $611 = (($610>>>0) / 10000)&-1;
  $45 = $611;
  $612 = $43;
  $613 = (($612>>>0) % 10000)&-1;
  $46 = $613;
  $614 = $45;
  $615 = (($614>>>0) / 100)&-1;
  $616 = $615 << 1;
  $47 = $616;
  $617 = $45;
  $618 = (($617>>>0) % 100)&-1;
  $619 = $618 << 1;
  $48 = $619;
  $620 = $46;
  $621 = (($620>>>0) / 100)&-1;
  $622 = $621 << 1;
  $49 = $622;
  $623 = $46;
  $624 = (($623>>>0) % 100)&-1;
  $625 = $624 << 1;
  $50 = $625;
  $626 = $44;
  $627 = (($626>>>0) / 10000)&-1;
  $51 = $627;
  $628 = $44;
  $629 = (($628>>>0) % 10000)&-1;
  $52 = $629;
  $630 = $51;
  $631 = (($630>>>0) / 100)&-1;
  $632 = $631 << 1;
  $53 = $632;
  $633 = $51;
  $634 = (($633>>>0) % 100)&-1;
  $635 = $634 << 1;
  $54 = $635;
  $636 = $52;
  $637 = (($636>>>0) / 100)&-1;
  $638 = $637 << 1;
  $55 = $638;
  $639 = $52;
  $640 = (($639>>>0) % 100)&-1;
  $641 = $640 << 1;
  $56 = $641;
  $642 = $5;
  $643 = $47;
  $644 = (($642) + ($643)|0);
  $645 = HEAP8[$644>>0]|0;
  $646 = $4;
  $647 = ((($646)) + 1|0);
  $4 = $647;
  HEAP8[$646>>0] = $645;
  $648 = $5;
  $649 = $47;
  $650 = (($649) + 1)|0;
  $651 = (($648) + ($650)|0);
  $652 = HEAP8[$651>>0]|0;
  $653 = $4;
  $654 = ((($653)) + 1|0);
  $4 = $654;
  HEAP8[$653>>0] = $652;
  $655 = $5;
  $656 = $48;
  $657 = (($655) + ($656)|0);
  $658 = HEAP8[$657>>0]|0;
  $659 = $4;
  $660 = ((($659)) + 1|0);
  $4 = $660;
  HEAP8[$659>>0] = $658;
  $661 = $5;
  $662 = $48;
  $663 = (($662) + 1)|0;
  $664 = (($661) + ($663)|0);
  $665 = HEAP8[$664>>0]|0;
  $666 = $4;
  $667 = ((($666)) + 1|0);
  $4 = $667;
  HEAP8[$666>>0] = $665;
  $668 = $5;
  $669 = $49;
  $670 = (($668) + ($669)|0);
  $671 = HEAP8[$670>>0]|0;
  $672 = $4;
  $673 = ((($672)) + 1|0);
  $4 = $673;
  HEAP8[$672>>0] = $671;
  $674 = $5;
  $675 = $49;
  $676 = (($675) + 1)|0;
  $677 = (($674) + ($676)|0);
  $678 = HEAP8[$677>>0]|0;
  $679 = $4;
  $680 = ((($679)) + 1|0);
  $4 = $680;
  HEAP8[$679>>0] = $678;
  $681 = $5;
  $682 = $50;
  $683 = (($681) + ($682)|0);
  $684 = HEAP8[$683>>0]|0;
  $685 = $4;
  $686 = ((($685)) + 1|0);
  $4 = $686;
  HEAP8[$685>>0] = $684;
  $687 = $5;
  $688 = $50;
  $689 = (($688) + 1)|0;
  $690 = (($687) + ($689)|0);
  $691 = HEAP8[$690>>0]|0;
  $692 = $4;
  $693 = ((($692)) + 1|0);
  $4 = $693;
  HEAP8[$692>>0] = $691;
  $694 = $5;
  $695 = $53;
  $696 = (($694) + ($695)|0);
  $697 = HEAP8[$696>>0]|0;
  $698 = $4;
  $699 = ((($698)) + 1|0);
  $4 = $699;
  HEAP8[$698>>0] = $697;
  $700 = $5;
  $701 = $53;
  $702 = (($701) + 1)|0;
  $703 = (($700) + ($702)|0);
  $704 = HEAP8[$703>>0]|0;
  $705 = $4;
  $706 = ((($705)) + 1|0);
  $4 = $706;
  HEAP8[$705>>0] = $704;
  $707 = $5;
  $708 = $54;
  $709 = (($707) + ($708)|0);
  $710 = HEAP8[$709>>0]|0;
  $711 = $4;
  $712 = ((($711)) + 1|0);
  $4 = $712;
  HEAP8[$711>>0] = $710;
  $713 = $5;
  $714 = $54;
  $715 = (($714) + 1)|0;
  $716 = (($713) + ($715)|0);
  $717 = HEAP8[$716>>0]|0;
  $718 = $4;
  $719 = ((($718)) + 1|0);
  $4 = $719;
  HEAP8[$718>>0] = $717;
  $720 = $5;
  $721 = $55;
  $722 = (($720) + ($721)|0);
  $723 = HEAP8[$722>>0]|0;
  $724 = $4;
  $725 = ((($724)) + 1|0);
  $4 = $725;
  HEAP8[$724>>0] = $723;
  $726 = $5;
  $727 = $55;
  $728 = (($727) + 1)|0;
  $729 = (($726) + ($728)|0);
  $730 = HEAP8[$729>>0]|0;
  $731 = $4;
  $732 = ((($731)) + 1|0);
  $4 = $732;
  HEAP8[$731>>0] = $730;
  $733 = $5;
  $734 = $56;
  $735 = (($733) + ($734)|0);
  $736 = HEAP8[$735>>0]|0;
  $737 = $4;
  $738 = ((($737)) + 1|0);
  $4 = $738;
  HEAP8[$737>>0] = $736;
  $739 = $5;
  $740 = $56;
  $741 = (($740) + 1)|0;
  $742 = (($739) + ($741)|0);
  $743 = HEAP8[$742>>0]|0;
  $744 = $4;
  $745 = ((($744)) + 1|0);
  $4 = $745;
  HEAP8[$744>>0] = $743;
  $746 = $4;
  STACKTOP = sp;return ($746|0);
 }
 $266 = (___udivdi3(($262|0),($265|0),100000000,0)|0);
 $267 = tempRet0;
 $24 = $266;
 $268 = $3;
 $269 = $268;
 $270 = HEAP32[$269>>2]|0;
 $271 = (($268) + 4)|0;
 $272 = $271;
 $273 = HEAP32[$272>>2]|0;
 $274 = (___uremdi3(($270|0),($273|0),100000000,0)|0);
 $275 = tempRet0;
 $25 = $274;
 $276 = $24;
 $277 = (($276>>>0) / 10000)&-1;
 $26 = $277;
 $278 = $24;
 $279 = (($278>>>0) % 10000)&-1;
 $27 = $279;
 $280 = $26;
 $281 = (($280>>>0) / 100)&-1;
 $282 = $281 << 1;
 $28 = $282;
 $283 = $26;
 $284 = (($283>>>0) % 100)&-1;
 $285 = $284 << 1;
 $29 = $285;
 $286 = $27;
 $287 = (($286>>>0) / 100)&-1;
 $288 = $287 << 1;
 $30 = $288;
 $289 = $27;
 $290 = (($289>>>0) % 100)&-1;
 $291 = $290 << 1;
 $31 = $291;
 $292 = $25;
 $293 = (($292>>>0) / 10000)&-1;
 $32 = $293;
 $294 = $25;
 $295 = (($294>>>0) % 10000)&-1;
 $33 = $295;
 $296 = $32;
 $297 = (($296>>>0) / 100)&-1;
 $298 = $297 << 1;
 $34 = $298;
 $299 = $32;
 $300 = (($299>>>0) % 100)&-1;
 $301 = $300 << 1;
 $35 = $301;
 $302 = $33;
 $303 = (($302>>>0) / 100)&-1;
 $304 = $303 << 1;
 $36 = $304;
 $305 = $33;
 $306 = (($305>>>0) % 100)&-1;
 $307 = $306 << 1;
 $37 = $307;
 $308 = $3;
 $309 = $308;
 $310 = HEAP32[$309>>2]|0;
 $311 = (($308) + 4)|0;
 $312 = $311;
 $313 = HEAP32[$312>>2]|0;
 $314 = ($313>>>0)>(232830);
 $315 = ($310>>>0)>=(2764472320);
 $316 = ($313|0)==(232830);
 $317 = $316 & $315;
 $318 = $314 | $317;
 if ($318) {
  $319 = $5;
  $320 = $28;
  $321 = (($319) + ($320)|0);
  $322 = HEAP8[$321>>0]|0;
  $323 = $4;
  $324 = ((($323)) + 1|0);
  $4 = $324;
  HEAP8[$323>>0] = $322;
 }
 $325 = $3;
 $326 = $325;
 $327 = HEAP32[$326>>2]|0;
 $328 = (($325) + 4)|0;
 $329 = $328;
 $330 = HEAP32[$329>>2]|0;
 $331 = ($330>>>0)>(23283);
 $332 = ($327>>>0)>=(276447232);
 $333 = ($330|0)==(23283);
 $334 = $333 & $332;
 $335 = $331 | $334;
 if ($335) {
  $336 = $5;
  $337 = $28;
  $338 = (($337) + 1)|0;
  $339 = (($336) + ($338)|0);
  $340 = HEAP8[$339>>0]|0;
  $341 = $4;
  $342 = ((($341)) + 1|0);
  $4 = $342;
  HEAP8[$341>>0] = $340;
 }
 $343 = $3;
 $344 = $343;
 $345 = HEAP32[$344>>2]|0;
 $346 = (($343) + 4)|0;
 $347 = $346;
 $348 = HEAP32[$347>>2]|0;
 $349 = ($348>>>0)>(2328);
 $350 = ($345>>>0)>=(1316134912);
 $351 = ($348|0)==(2328);
 $352 = $351 & $350;
 $353 = $349 | $352;
 if ($353) {
  $354 = $5;
  $355 = $29;
  $356 = (($354) + ($355)|0);
  $357 = HEAP8[$356>>0]|0;
  $358 = $4;
  $359 = ((($358)) + 1|0);
  $4 = $359;
  HEAP8[$358>>0] = $357;
 }
 $360 = $3;
 $361 = $360;
 $362 = HEAP32[$361>>2]|0;
 $363 = (($360) + 4)|0;
 $364 = $363;
 $365 = HEAP32[$364>>2]|0;
 $366 = ($365>>>0)>(232);
 $367 = ($362>>>0)>=(3567587328);
 $368 = ($365|0)==(232);
 $369 = $368 & $367;
 $370 = $366 | $369;
 if ($370) {
  $371 = $5;
  $372 = $29;
  $373 = (($372) + 1)|0;
  $374 = (($371) + ($373)|0);
  $375 = HEAP8[$374>>0]|0;
  $376 = $4;
  $377 = ((($376)) + 1|0);
  $4 = $377;
  HEAP8[$376>>0] = $375;
 }
 $378 = $3;
 $379 = $378;
 $380 = HEAP32[$379>>2]|0;
 $381 = (($378) + 4)|0;
 $382 = $381;
 $383 = HEAP32[$382>>2]|0;
 $384 = ($383>>>0)>(23);
 $385 = ($380>>>0)>=(1215752192);
 $386 = ($383|0)==(23);
 $387 = $386 & $385;
 $388 = $384 | $387;
 if ($388) {
  $389 = $5;
  $390 = $30;
  $391 = (($389) + ($390)|0);
  $392 = HEAP8[$391>>0]|0;
  $393 = $4;
  $394 = ((($393)) + 1|0);
  $4 = $394;
  HEAP8[$393>>0] = $392;
 }
 $395 = $3;
 $396 = $395;
 $397 = HEAP32[$396>>2]|0;
 $398 = (($395) + 4)|0;
 $399 = $398;
 $400 = HEAP32[$399>>2]|0;
 $401 = ($400>>>0)>(2);
 $402 = ($397>>>0)>=(1410065408);
 $403 = ($400|0)==(2);
 $404 = $403 & $402;
 $405 = $401 | $404;
 if ($405) {
  $406 = $5;
  $407 = $30;
  $408 = (($407) + 1)|0;
  $409 = (($406) + ($408)|0);
  $410 = HEAP8[$409>>0]|0;
  $411 = $4;
  $412 = ((($411)) + 1|0);
  $4 = $412;
  HEAP8[$411>>0] = $410;
 }
 $413 = $3;
 $414 = $413;
 $415 = HEAP32[$414>>2]|0;
 $416 = (($413) + 4)|0;
 $417 = $416;
 $418 = HEAP32[$417>>2]|0;
 $419 = ($418>>>0)>(0);
 $420 = ($415>>>0)>=(1000000000);
 $421 = ($418|0)==(0);
 $422 = $421 & $420;
 $423 = $419 | $422;
 if ($423) {
  $424 = $5;
  $425 = $31;
  $426 = (($424) + ($425)|0);
  $427 = HEAP8[$426>>0]|0;
  $428 = $4;
  $429 = ((($428)) + 1|0);
  $4 = $429;
  HEAP8[$428>>0] = $427;
 }
 $430 = $3;
 $431 = $430;
 $432 = HEAP32[$431>>2]|0;
 $433 = (($430) + 4)|0;
 $434 = $433;
 $435 = HEAP32[$434>>2]|0;
 $436 = ($435>>>0)>(0);
 $437 = ($432>>>0)>=(100000000);
 $438 = ($435|0)==(0);
 $439 = $438 & $437;
 $440 = $436 | $439;
 if ($440) {
  $441 = $5;
  $442 = $31;
  $443 = (($442) + 1)|0;
  $444 = (($441) + ($443)|0);
  $445 = HEAP8[$444>>0]|0;
  $446 = $4;
  $447 = ((($446)) + 1|0);
  $4 = $447;
  HEAP8[$446>>0] = $445;
 }
 $448 = $5;
 $449 = $34;
 $450 = (($448) + ($449)|0);
 $451 = HEAP8[$450>>0]|0;
 $452 = $4;
 $453 = ((($452)) + 1|0);
 $4 = $453;
 HEAP8[$452>>0] = $451;
 $454 = $5;
 $455 = $34;
 $456 = (($455) + 1)|0;
 $457 = (($454) + ($456)|0);
 $458 = HEAP8[$457>>0]|0;
 $459 = $4;
 $460 = ((($459)) + 1|0);
 $4 = $460;
 HEAP8[$459>>0] = $458;
 $461 = $5;
 $462 = $35;
 $463 = (($461) + ($462)|0);
 $464 = HEAP8[$463>>0]|0;
 $465 = $4;
 $466 = ((($465)) + 1|0);
 $4 = $466;
 HEAP8[$465>>0] = $464;
 $467 = $5;
 $468 = $35;
 $469 = (($468) + 1)|0;
 $470 = (($467) + ($469)|0);
 $471 = HEAP8[$470>>0]|0;
 $472 = $4;
 $473 = ((($472)) + 1|0);
 $4 = $473;
 HEAP8[$472>>0] = $471;
 $474 = $5;
 $475 = $36;
 $476 = (($474) + ($475)|0);
 $477 = HEAP8[$476>>0]|0;
 $478 = $4;
 $479 = ((($478)) + 1|0);
 $4 = $479;
 HEAP8[$478>>0] = $477;
 $480 = $5;
 $481 = $36;
 $482 = (($481) + 1)|0;
 $483 = (($480) + ($482)|0);
 $484 = HEAP8[$483>>0]|0;
 $485 = $4;
 $486 = ((($485)) + 1|0);
 $4 = $486;
 HEAP8[$485>>0] = $484;
 $487 = $5;
 $488 = $37;
 $489 = (($487) + ($488)|0);
 $490 = HEAP8[$489>>0]|0;
 $491 = $4;
 $492 = ((($491)) + 1|0);
 $4 = $492;
 HEAP8[$491>>0] = $490;
 $493 = $5;
 $494 = $37;
 $495 = (($494) + 1)|0;
 $496 = (($493) + ($495)|0);
 $497 = HEAP8[$496>>0]|0;
 $498 = $4;
 $499 = ((($498)) + 1|0);
 $4 = $499;
 HEAP8[$498>>0] = $497;
 $746 = $4;
 STACKTOP = sp;return ($746|0);
}
function __ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EE11WriteUint64Ey($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $3 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = sp;
 $3 = $0;
 $7 = $4;
 $8 = $7;
 HEAP32[$8>>2] = $1;
 $9 = (($7) + 4)|0;
 $10 = $9;
 HEAP32[$10>>2] = $2;
 $11 = $3;
 $12 = HEAP32[$11>>2]|0;
 $13 = (__ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE4PushEj($12,20)|0);
 $5 = $13;
 $14 = $4;
 $15 = $14;
 $16 = HEAP32[$15>>2]|0;
 $17 = (($14) + 4)|0;
 $18 = $17;
 $19 = HEAP32[$18>>2]|0;
 $20 = $5;
 $21 = (__ZN9rapidjson8internal6u64toaEyPc($16,$19,$20)|0);
 $6 = $21;
 $22 = HEAP32[$11>>2]|0;
 $23 = $6;
 $24 = $5;
 $25 = $23;
 $26 = $24;
 $27 = (($25) - ($26))|0;
 $28 = (20 - ($27))|0;
 __ZN9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE3PopEj($22,$28);
 STACKTOP = sp;return 1;
}
function __ZN9rapidjson8internal5StackINS_12CrtAllocatorEE6BottomIcEEPT_v($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 STACKTOP = sp;return ($4|0);
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9SetStringENS_16GenericStringRefIcEERS5_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $5 = sp;
 $3 = $0;
 $4 = $2;
 $6 = $3;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEED2Ev($6);
 __ZN9rapidjson16GenericStringRefIcEC2ERKS1_($5,$1);
 $7 = $4;
 __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE12SetStringRawENS_16GenericStringRefIcEERS5_($6,$5,$7);
 STACKTOP = sp;return ($6|0);
}
function __ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE13MemberReserveEjRS5_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE8IsObjectEv($6)|0);
 if (!($7)) {
  ___assert_fail((5916|0),(4920|0),1151,(7036|0));
  // unreachable;
 }
 $8 = $4;
 $9 = ((($6)) + 4|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ($8>>>0)>($10>>>0);
 if (!($11)) {
  STACKTOP = sp;return ($6|0);
 }
 $12 = $5;
 $13 = (__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE17GetMembersPointerEv($6)|0);
 $14 = ((($6)) + 4|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = ($15*48)|0;
 $17 = $4;
 $18 = ($17*48)|0;
 $19 = (__ZN9rapidjson19MemoryPoolAllocatorINS_12CrtAllocatorEE7ReallocEPvjj($12,$13,$16,$18)|0);
 (__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE17SetMembersPointerEPNS_13GenericMemberIS2_S5_EE($6,$19)|0);
 $20 = $4;
 $21 = ((($6)) + 4|0);
 HEAP32[$21>>2] = $20;
 STACKTOP = sp;return ($6|0);
}
function __ZN9rapidjson19MemoryPoolAllocatorINS_12CrtAllocatorEE7ReallocEPvjj($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $11 = $5;
 $12 = $6;
 $13 = ($12|0)==(0|0);
 $14 = $8;
 if ($13) {
  $15 = (__ZN9rapidjson19MemoryPoolAllocatorINS_12CrtAllocatorEE6MallocEj($11,$14)|0);
  $4 = $15;
  $66 = $4;
  STACKTOP = sp;return ($66|0);
 }
 $16 = ($14|0)==(0);
 if ($16) {
  $4 = 0;
  $66 = $4;
  STACKTOP = sp;return ($66|0);
 }
 $17 = $7;
 $18 = (_i64Add(($17|0),0,7,0)|0);
 $19 = tempRet0;
 $20 = $18 & -8;
 $7 = $20;
 $21 = $8;
 $22 = (_i64Add(($21|0),0,7,0)|0);
 $23 = tempRet0;
 $24 = $22 & -8;
 $8 = $24;
 $25 = $7;
 $26 = $8;
 $27 = ($25>>>0)>=($26>>>0);
 $28 = $6;
 if ($27) {
  $4 = $28;
  $66 = $4;
  STACKTOP = sp;return ($66|0);
 }
 $29 = HEAP32[$11>>2]|0;
 $30 = ((($29)) + 16|0);
 $31 = HEAP32[$11>>2]|0;
 $32 = ((($31)) + 4|0);
 $33 = HEAP32[$32>>2]|0;
 $34 = (($30) + ($33)|0);
 $35 = $7;
 $36 = (0 - ($35))|0;
 $37 = (($34) + ($36)|0);
 $38 = ($28|0)==($37|0);
 if ($38) {
  $39 = $8;
  $40 = $7;
  $41 = (($39) - ($40))|0;
  $9 = $41;
  $42 = HEAP32[$11>>2]|0;
  $43 = ((($42)) + 4|0);
  $44 = HEAP32[$43>>2]|0;
  $45 = $9;
  $46 = (($44) + ($45))|0;
  $47 = HEAP32[$11>>2]|0;
  $48 = HEAP32[$47>>2]|0;
  $49 = ($46>>>0)<=($48>>>0);
  if ($49) {
   $50 = $9;
   $51 = HEAP32[$11>>2]|0;
   $52 = ((($51)) + 4|0);
   $53 = HEAP32[$52>>2]|0;
   $54 = (($53) + ($50))|0;
   HEAP32[$52>>2] = $54;
   $55 = $6;
   $4 = $55;
   $66 = $4;
   STACKTOP = sp;return ($66|0);
  }
 }
 $56 = $8;
 $57 = (__ZN9rapidjson19MemoryPoolAllocatorINS_12CrtAllocatorEE6MallocEj($11,$56)|0);
 $10 = $57;
 $58 = $10;
 $59 = ($58|0)!=(0|0);
 if (!($59)) {
  $4 = 0;
  $66 = $4;
  STACKTOP = sp;return ($66|0);
 }
 $60 = $7;
 $61 = ($60|0)!=(0);
 if ($61) {
  $62 = $10;
  $63 = $6;
  $64 = $7;
  _memcpy(($62|0),($63|0),($64|0))|0;
 }
 $65 = $10;
 $4 = $65;
 $66 = $4;
 STACKTOP = sp;return ($66|0);
}
function __ZN10emscripten8internal11NoBaseClass6verifyI6MyJsonEEvv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10emscripten8internal13getActualTypeI6MyJsonEEPKvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (__ZN10emscripten8internal14getLightTypeIDI6MyJsonEEPKvRKT_($2)|0);
 STACKTOP = sp;return ($3|0);
}
function __ZN10emscripten8internal11NoBaseClass11getUpcasterI6MyJsonEEPFvvEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0);
}
function __ZN10emscripten8internal11NoBaseClass13getDowncasterI6MyJsonEEPFvvEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0);
}
function __ZN10emscripten8internal14raw_destructorI6MyJsonEEvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ($2|0)==(0|0);
 if (!($3)) {
  __ZN6MyJsonD2Ev($2);
  __ZdlPv($2);
 }
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDI6MyJsonE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDI6MyJsonE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI6MyJsonEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIP6MyJsonE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK6MyJsonEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIPK6MyJsonE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11NoBaseClass3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0);
}
function __ZN10emscripten8internal14getLightTypeIDI6MyJsonEEPKvRKT_($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return (3176|0);
}
function __ZN6MyJsonD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_ED2Ev($2);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal11LightTypeIDI6MyJsonE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3176|0);
}
function __ZN10emscripten8internal11LightTypeIDIP6MyJsonE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3184|0);
}
function __ZN10emscripten8internal11LightTypeIDIPK6MyJsonE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3200|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (7077|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (7080|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (7082|0);
}
function __ZN10emscripten8internal12operator_newI6MyJsonJRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEEEEPT_DpOT0_($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $5 = (__Znwj(80)|0);
 $6 = $2;
 $1 = $6;
 $7 = $1;
 __THREW__ = 0;
 invoke_vii(115,($5|0),($7|0));
 $8 = __THREW__; __THREW__ = 0;
 $9 = $8&1;
 if ($9) {
  $10 = ___cxa_find_matching_catch_2()|0;
  $11 = tempRet0;
  $3 = $10;
  $4 = $11;
  __ZdlPv($5);
  $12 = $3;
  $13 = $4;
  ___resumeException($12|0);
  // unreachable;
 } else {
  STACKTOP = sp;return ($5|0);
 }
 return (0)|0;
}
function __ZN10emscripten8internal7InvokerIP6MyJsonJRKNSt3__212basic_stringIcNS4_11char_traitsIcEENS4_9allocatorIcEEEEEE6invokeEPFS3_SC_EPNS0_11BindingTypeISA_EUt_E($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = sp + 8|0;
 $2 = $0;
 $3 = $1;
 $7 = $2;
 $8 = $3;
 __ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE12fromWireTypeEPNS9_Ut_E($4,$8);
 __THREW__ = 0;
 $9 = (invoke_ii($7|0,($4|0))|0);
 $10 = __THREW__; __THREW__ = 0;
 $11 = $10&1;
 if (!($11)) {
  __THREW__ = 0;
  $12 = (invoke_ii(116,($9|0))|0);
  $13 = __THREW__; __THREW__ = 0;
  $14 = $13&1;
  if (!($14)) {
   __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($4);
   STACKTOP = sp;return ($12|0);
  }
 }
 $15 = ___cxa_find_matching_catch_2()|0;
 $16 = tempRet0;
 $5 = $15;
 $6 = $16;
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($4);
 $17 = $5;
 $18 = $6;
 ___resumeException($17|0);
 // unreachable;
 return (0)|0;
}
function __ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP6MyJsonRKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEEEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 2;
}
function __ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP6MyJsonRKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEEEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS6_11char_traitsIcEENS6_9allocatorIcEEEEEEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal11BindingTypeIP6MyJsonE10toWireTypeES3_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE12fromWireTypeEPNS9_Ut_E($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0;
 var $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(224|0);
 $38 = sp;
 $40 = sp + 221|0;
 $51 = sp + 220|0;
 $58 = $1;
 $59 = $58;
 $60 = ((($59)) + 4|0);
 $61 = $58;
 $62 = HEAP32[$61>>2]|0;
 $55 = $0;
 $56 = $60;
 $57 = $62;
 $63 = $55;
 $54 = $63;
 $64 = $54;
 $53 = $64;
 $65 = $53;
 $52 = $65;
 ;HEAP32[$65>>2]=0|0;HEAP32[$65+4>>2]=0|0;HEAP32[$65+8>>2]=0|0;
 $66 = $56;
 $67 = $57;
 $46 = $63;
 $47 = $66;
 $48 = $67;
 $68 = $46;
 $69 = $48;
 $44 = $68;
 $70 = $44;
 $43 = $70;
 $71 = $43;
 $42 = $71;
 $72 = $42;
 $41 = $72;
 $73 = $41;
 $39 = $73;
 $74 = $39;
 ;HEAP8[$38>>0]=HEAP8[$40>>0]|0;
 $37 = $74;
 $75 = $37;
 $36 = $75;
 $45 = -1;
 $76 = $45;
 $77 = (($76) - 16)|0;
 $78 = ($69>>>0)>($77>>>0);
 if ($78) {
  __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($68);
  // unreachable;
 }
 $79 = $48;
 $80 = ($79>>>0)<(11);
 $81 = $48;
 if ($80) {
  $34 = $68;
  $35 = $81;
  $82 = $34;
  $83 = $35;
  $84 = $83&255;
  $33 = $82;
  $85 = $33;
  $32 = $85;
  $86 = $32;
  $87 = ((($86)) + 11|0);
  HEAP8[$87>>0] = $84;
  $31 = $68;
  $88 = $31;
  $30 = $88;
  $89 = $30;
  $29 = $89;
  $90 = $29;
  $28 = $90;
  $91 = $28;
  $27 = $91;
  $92 = $27;
  $49 = $92;
  $132 = $49;
  $26 = $132;
  $133 = $26;
  $134 = $47;
  $135 = $48;
  (__ZNSt3__211char_traitsIcE4copyEPcPKcj($133,$134,$135)|0);
  $136 = $49;
  $137 = $48;
  $138 = (($136) + ($137)|0);
  HEAP8[$51>>0] = 0;
  __ZNSt3__211char_traitsIcE6assignERcRKc($138,$51);
  STACKTOP = sp;return;
 }
 $6 = $81;
 $93 = $6;
 $94 = ($93>>>0)<(11);
 if ($94) {
  $101 = 11;
 } else {
  $95 = $6;
  $96 = (($95) + 1)|0;
  $5 = $96;
  $97 = $5;
  $98 = (($97) + 15)|0;
  $99 = $98 & -16;
  $101 = $99;
 }
 $100 = (($101) - 1)|0;
 $50 = $100;
 $4 = $68;
 $102 = $4;
 $3 = $102;
 $103 = $3;
 $2 = $103;
 $104 = $2;
 $105 = $50;
 $106 = (($105) + 1)|0;
 $12 = $104;
 $13 = $106;
 $107 = $12;
 $108 = $13;
 $9 = $107;
 $10 = $108;
 $11 = 0;
 $109 = $9;
 $8 = $109;
 $110 = $10;
 $7 = $110;
 $111 = $7;
 $112 = (__Znwj($111)|0);
 $49 = $112;
 $113 = $49;
 $16 = $68;
 $17 = $113;
 $114 = $16;
 $115 = $17;
 $15 = $114;
 $116 = $15;
 $14 = $116;
 $117 = $14;
 HEAP32[$117>>2] = $115;
 $118 = $50;
 $119 = (($118) + 1)|0;
 $20 = $68;
 $21 = $119;
 $120 = $20;
 $121 = $21;
 $122 = -2147483648 | $121;
 $19 = $120;
 $123 = $19;
 $18 = $123;
 $124 = $18;
 $125 = ((($124)) + 8|0);
 HEAP32[$125>>2] = $122;
 $126 = $48;
 $24 = $68;
 $25 = $126;
 $127 = $24;
 $128 = $25;
 $23 = $127;
 $129 = $23;
 $22 = $129;
 $130 = $22;
 $131 = ((($130)) + 4|0);
 HEAP32[$131>>2] = $128;
 $132 = $49;
 $26 = $132;
 $133 = $26;
 $134 = $47;
 $135 = $48;
 (__ZNSt3__211char_traitsIcE4copyEPcPKcj($133,$134,$135)|0);
 $136 = $49;
 $137 = $48;
 $138 = (($136) + ($137)|0);
 HEAP8[$51>>0] = 0;
 __ZNSt3__211char_traitsIcE6assignERcRKc($138,$51);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS6_11char_traitsIcEENS6_9allocatorIcEEEEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3728|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (7186|0);
}
function __ZN10emscripten8internal13MethodInvokerIM6MyJsonFNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEvES9_PS2_JEE6invokeERKSB_SC_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = sp + 8|0;
 $2 = $0;
 $3 = $1;
 $7 = $3;
 $8 = (__ZN10emscripten8internal11BindingTypeIP6MyJsonE12fromWireTypeES3_($7)|0);
 $9 = $2;
 $$field = HEAP32[$9>>2]|0;
 $$index1 = ((($9)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 $10 = $$field2 >> 1;
 $11 = (($8) + ($10)|0);
 $12 = $$field2 & 1;
 $13 = ($12|0)!=(0);
 if ($13) {
  $14 = HEAP32[$11>>2]|0;
  $15 = (($14) + ($$field)|0);
  $16 = HEAP32[$15>>2]|0;
  $18 = $16;
 } else {
  $17 = $$field;
  $18 = $17;
 }
 FUNCTION_TABLE_vii[$18 & 127]($4,$11);
 __THREW__ = 0;
 $19 = (invoke_ii(117,($4|0))|0);
 $20 = __THREW__; __THREW__ = 0;
 $21 = $20&1;
 if ($21) {
  $22 = ___cxa_find_matching_catch_2()|0;
  $23 = tempRet0;
  $5 = $22;
  $6 = $23;
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($4);
  $24 = $5;
  $25 = $6;
  ___resumeException($24|0);
  // unreachable;
 } else {
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($4);
  STACKTOP = sp;return ($19|0);
 }
 return (0)|0;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNSt3__212basic_stringIcNS4_11char_traitsIcEENS4_9allocatorIcEEEENS0_17AllowedRawPointerI6MyJsonEEEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 2;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNSt3__212basic_stringIcNS4_11char_traitsIcEENS4_9allocatorIcEEEENS0_17AllowedRawPointerI6MyJsonEEEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEENS0_17AllowedRawPointerI6MyJsonEEEEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal10getContextIM6MyJsonFNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEvEEEPT_RKSC_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0);
 $3 = $1;
 $$field = HEAP32[$3>>2]|0;
 $$index1 = ((($3)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 HEAP32[$2>>2] = $$field;
 $$index5 = ((($2)) + 4|0);
 HEAP32[$$index5>>2] = $$field2;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE10toWireTypeERKS8_($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0;
 var $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0;
 var $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0;
 var $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0;
 var $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0;
 var $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0;
 var $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 208|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(208|0);
 $48 = $0;
 $50 = $48;
 $47 = $50;
 $51 = $47;
 $46 = $51;
 $52 = $46;
 $45 = $52;
 $53 = $45;
 $44 = $53;
 $54 = $44;
 $43 = $54;
 $55 = $43;
 $56 = ((($55)) + 11|0);
 $57 = HEAP8[$56>>0]|0;
 $58 = $57&255;
 $59 = $58 & 128;
 $60 = ($59|0)!=(0);
 if ($60) {
  $39 = $52;
  $61 = $39;
  $38 = $61;
  $62 = $38;
  $37 = $62;
  $63 = $37;
  $64 = ((($63)) + 4|0);
  $65 = HEAP32[$64>>2]|0;
  $73 = $65;
 } else {
  $42 = $52;
  $66 = $42;
  $41 = $66;
  $67 = $41;
  $40 = $67;
  $68 = $40;
  $69 = ((($68)) + 11|0);
  $70 = HEAP8[$69>>0]|0;
  $71 = $70&255;
  $73 = $71;
 }
 $72 = (4 + ($73))|0;
 $74 = (_malloc($72)|0);
 $49 = $74;
 $75 = $48;
 $11 = $75;
 $76 = $11;
 $10 = $76;
 $77 = $10;
 $9 = $77;
 $78 = $9;
 $8 = $78;
 $79 = $8;
 $7 = $79;
 $80 = $7;
 $81 = ((($80)) + 11|0);
 $82 = HEAP8[$81>>0]|0;
 $83 = $82&255;
 $84 = $83 & 128;
 $85 = ($84|0)!=(0);
 if ($85) {
  $3 = $77;
  $86 = $3;
  $2 = $86;
  $87 = $2;
  $1 = $87;
  $88 = $1;
  $89 = ((($88)) + 4|0);
  $90 = HEAP32[$89>>2]|0;
  $98 = $90;
 } else {
  $6 = $77;
  $91 = $6;
  $5 = $91;
  $92 = $5;
  $4 = $92;
  $93 = $4;
  $94 = ((($93)) + 11|0);
  $95 = HEAP8[$94>>0]|0;
  $96 = $95&255;
  $98 = $96;
 }
 $97 = $49;
 HEAP32[$97>>2] = $98;
 $99 = $49;
 $100 = ((($99)) + 4|0);
 $101 = $48;
 $25 = $101;
 $102 = $25;
 $24 = $102;
 $103 = $24;
 $23 = $103;
 $104 = $23;
 $22 = $104;
 $105 = $22;
 $21 = $105;
 $106 = $21;
 $107 = ((($106)) + 11|0);
 $108 = HEAP8[$107>>0]|0;
 $109 = $108&255;
 $110 = $109 & 128;
 $111 = ($110|0)!=(0);
 if ($111) {
  $15 = $103;
  $112 = $15;
  $14 = $112;
  $113 = $14;
  $13 = $113;
  $114 = $13;
  $115 = HEAP32[$114>>2]|0;
  $121 = $115;
 } else {
  $20 = $103;
  $116 = $20;
  $19 = $116;
  $117 = $19;
  $18 = $117;
  $118 = $18;
  $17 = $118;
  $119 = $17;
  $16 = $119;
  $120 = $16;
  $121 = $120;
 }
 $12 = $121;
 $122 = $12;
 $123 = $48;
 $36 = $123;
 $124 = $36;
 $35 = $124;
 $125 = $35;
 $34 = $125;
 $126 = $34;
 $33 = $126;
 $127 = $33;
 $32 = $127;
 $128 = $32;
 $129 = ((($128)) + 11|0);
 $130 = HEAP8[$129>>0]|0;
 $131 = $130&255;
 $132 = $131 & 128;
 $133 = ($132|0)!=(0);
 if ($133) {
  $28 = $125;
  $134 = $28;
  $27 = $134;
  $135 = $27;
  $26 = $135;
  $136 = $26;
  $137 = ((($136)) + 4|0);
  $138 = HEAP32[$137>>2]|0;
  $145 = $138;
  _memcpy(($100|0),($122|0),($145|0))|0;
  $146 = $49;
  STACKTOP = sp;return ($146|0);
 } else {
  $31 = $125;
  $139 = $31;
  $30 = $139;
  $140 = $30;
  $29 = $140;
  $141 = $29;
  $142 = ((($141)) + 11|0);
  $143 = HEAP8[$142>>0]|0;
  $144 = $143&255;
  $145 = $144;
  _memcpy(($100|0),($122|0),($145|0))|0;
  $146 = $49;
  STACKTOP = sp;return ($146|0);
 }
 return (0)|0;
}
function __ZN10emscripten8internal11BindingTypeIP6MyJsonE12fromWireTypeES3_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEENS0_17AllowedRawPointerI6MyJsonEEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3736|0);
}
function __ZN10emscripten8internal13MethodInvokerIM6MyJsonFivEiPS2_JEE6invokeERKS4_S5_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = sp;
 $2 = $0;
 $3 = $1;
 $5 = $3;
 $6 = (__ZN10emscripten8internal11BindingTypeIP6MyJsonE12fromWireTypeES3_($5)|0);
 $7 = $2;
 $$field = HEAP32[$7>>2]|0;
 $$index1 = ((($7)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 $8 = $$field2 >> 1;
 $9 = (($6) + ($8)|0);
 $10 = $$field2 & 1;
 $11 = ($10|0)!=(0);
 if ($11) {
  $12 = HEAP32[$9>>2]|0;
  $13 = (($12) + ($$field)|0);
  $14 = HEAP32[$13>>2]|0;
  $16 = $14;
 } else {
  $15 = $$field;
  $16 = $15;
 }
 $17 = (FUNCTION_TABLE_ii[$16 & 127]($9)|0);
 HEAP32[$4>>2] = $17;
 $18 = (__ZN10emscripten8internal11BindingTypeIiE10toWireTypeERKi($4)|0);
 STACKTOP = sp;return ($18|0);
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiNS0_17AllowedRawPointerI6MyJsonEEEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 2;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiNS0_17AllowedRawPointerI6MyJsonEEEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJiNS0_17AllowedRawPointerI6MyJsonEEEEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal10getContextIM6MyJsonFivEEEPT_RKS5_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0);
 $3 = $1;
 $$field = HEAP32[$3>>2]|0;
 $$index1 = ((($3)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 HEAP32[$2>>2] = $$field;
 $$index5 = ((($2)) + 4|0);
 HEAP32[$$index5>>2] = $$field2;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal11BindingTypeIiE10toWireTypeERKi($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 STACKTOP = sp;return ($3|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJiNS0_17AllowedRawPointerI6MyJsonEEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3744|0);
}
function __ZN10emscripten8internal13MethodInvokerIM6MyJsonFiRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEEiPS2_JSB_EE6invokeERKSD_SE_PNS0_11BindingTypeIS9_EUt_E($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $6 = sp + 20|0;
 $7 = sp + 8|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $10 = $4;
 $11 = (__ZN10emscripten8internal11BindingTypeIP6MyJsonE12fromWireTypeES3_($10)|0);
 $12 = $3;
 $$field = HEAP32[$12>>2]|0;
 $$index1 = ((($12)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 $13 = $$field2 >> 1;
 $14 = (($11) + ($13)|0);
 $15 = $$field2 & 1;
 $16 = ($15|0)!=(0);
 if ($16) {
  $17 = HEAP32[$14>>2]|0;
  $18 = (($17) + ($$field)|0);
  $19 = HEAP32[$18>>2]|0;
  $22 = $19;
 } else {
  $20 = $$field;
  $22 = $20;
 }
 $21 = $5;
 __ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE12fromWireTypeEPNS9_Ut_E($7,$21);
 __THREW__ = 0;
 $23 = (invoke_iii($22|0,($14|0),($7|0))|0);
 $24 = __THREW__; __THREW__ = 0;
 $25 = $24&1;
 if ($25) {
  $29 = ___cxa_find_matching_catch_2()|0;
  $30 = tempRet0;
  $8 = $29;
  $9 = $30;
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($7);
  $31 = $8;
  $32 = $9;
  ___resumeException($31|0);
  // unreachable;
 }
 HEAP32[$6>>2] = $23;
 __THREW__ = 0;
 $26 = (invoke_ii(118,($6|0))|0);
 $27 = __THREW__; __THREW__ = 0;
 $28 = $27&1;
 if ($28) {
  $29 = ___cxa_find_matching_catch_2()|0;
  $30 = tempRet0;
  $8 = $29;
  $9 = $30;
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($7);
  $31 = $8;
  $32 = $9;
  ___resumeException($31|0);
  // unreachable;
 } else {
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($7);
  STACKTOP = sp;return ($26|0);
 }
 return (0)|0;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEEEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 3;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEEEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJiNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS6_11char_traitsIcEENS6_9allocatorIcEEEEEEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal10getContextIM6MyJsonFiRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEEEEPT_RKSE_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0);
 $3 = $1;
 $$field = HEAP32[$3>>2]|0;
 $$index1 = ((($3)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 HEAP32[$2>>2] = $$field;
 $$index5 = ((($2)) + 4|0);
 HEAP32[$$index5>>2] = $$field2;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJiNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS6_11char_traitsIcEENS6_9allocatorIcEEEEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3752|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJiiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (7190|0);
}
function __ZN10emscripten8internal13MethodInvokerIM6MyJsonFvRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEEvPS2_JSB_EE6invokeERKSD_SE_PNS0_11BindingTypeIS9_EUt_E($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $6 = sp + 8|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $9 = $4;
 $10 = (__ZN10emscripten8internal11BindingTypeIP6MyJsonE12fromWireTypeES3_($9)|0);
 $11 = $3;
 $$field = HEAP32[$11>>2]|0;
 $$index1 = ((($11)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 $12 = $$field2 >> 1;
 $13 = (($10) + ($12)|0);
 $14 = $$field2 & 1;
 $15 = ($14|0)!=(0);
 if ($15) {
  $16 = HEAP32[$13>>2]|0;
  $17 = (($16) + ($$field)|0);
  $18 = HEAP32[$17>>2]|0;
  $21 = $18;
 } else {
  $19 = $$field;
  $21 = $19;
 }
 $20 = $5;
 __ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE12fromWireTypeEPNS9_Ut_E($6,$20);
 __THREW__ = 0;
 invoke_vii($21|0,($13|0),($6|0));
 $22 = __THREW__; __THREW__ = 0;
 $23 = $22&1;
 if ($23) {
  $24 = ___cxa_find_matching_catch_2()|0;
  $25 = tempRet0;
  $7 = $24;
  $8 = $25;
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($6);
  $26 = $7;
  $27 = $8;
  ___resumeException($26|0);
  // unreachable;
 } else {
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($6);
  STACKTOP = sp;return;
 }
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEEEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 3;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEEEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS6_11char_traitsIcEENS6_9allocatorIcEEEEEEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal10getContextIM6MyJsonFvRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEEEEPT_RKSE_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0);
 $3 = $1;
 $$field = HEAP32[$3>>2]|0;
 $$index1 = ((($3)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 HEAP32[$2>>2] = $$field;
 $$index5 = ((($2)) + 4|0);
 HEAP32[$$index5>>2] = $$field2;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS6_11char_traitsIcEENS6_9allocatorIcEEEEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3764|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (7195|0);
}
function __ZN10emscripten8internal13MethodInvokerIM6MyJsonFvRKiEvPS2_JS4_EE6invokeERKS6_S7_i($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $6 = sp;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = $4;
 $8 = (__ZN10emscripten8internal11BindingTypeIP6MyJsonE12fromWireTypeES3_($7)|0);
 $9 = $3;
 $$field = HEAP32[$9>>2]|0;
 $$index1 = ((($9)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 $10 = $$field2 >> 1;
 $11 = (($8) + ($10)|0);
 $12 = $$field2 & 1;
 $13 = ($12|0)!=(0);
 if ($13) {
  $14 = HEAP32[$11>>2]|0;
  $15 = (($14) + ($$field)|0);
  $16 = HEAP32[$15>>2]|0;
  $20 = $16;
 } else {
  $17 = $$field;
  $20 = $17;
 }
 $18 = $5;
 $19 = (__ZN10emscripten8internal11BindingTypeIiE12fromWireTypeEi($18)|0);
 HEAP32[$6>>2] = $19;
 FUNCTION_TABLE_vii[$20 & 127]($11,$6);
 STACKTOP = sp;return;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKiEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 3;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKiEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKiEEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal10getContextIM6MyJsonFvRKiEEEPT_RKS7_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0);
 $3 = $1;
 $$field = HEAP32[$3>>2]|0;
 $$index1 = ((($3)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 HEAP32[$2>>2] = $$field;
 $$index5 = ((($2)) + 4|0);
 HEAP32[$$index5>>2] = $$field2;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal11BindingTypeIiE12fromWireTypeEi($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKiEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3776|0);
}
function __ZN10emscripten8internal13MethodInvokerIM6MyJsonFvRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEERKiEvPS2_JSB_SD_EE6invokeERKSF_SG_PNS0_11BindingTypeIS9_EUt_Ei($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $8 = sp + 12|0;
 $9 = sp + 8|0;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $12 = $5;
 $13 = (__ZN10emscripten8internal11BindingTypeIP6MyJsonE12fromWireTypeES3_($12)|0);
 $14 = $4;
 $$field = HEAP32[$14>>2]|0;
 $$index1 = ((($14)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 $15 = $$field2 >> 1;
 $16 = (($13) + ($15)|0);
 $17 = $$field2 & 1;
 $18 = ($17|0)!=(0);
 if ($18) {
  $19 = HEAP32[$16>>2]|0;
  $20 = (($19) + ($$field)|0);
  $21 = HEAP32[$20>>2]|0;
  $28 = $21;
 } else {
  $22 = $$field;
  $28 = $22;
 }
 $23 = $6;
 __ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE12fromWireTypeEPNS9_Ut_E($8,$23);
 $24 = $7;
 __THREW__ = 0;
 $25 = (invoke_ii(119,($24|0))|0);
 $26 = __THREW__; __THREW__ = 0;
 $27 = $26&1;
 if ($27) {
  $31 = ___cxa_find_matching_catch_2()|0;
  $32 = tempRet0;
  $10 = $31;
  $11 = $32;
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($8);
  $33 = $10;
  $34 = $11;
  ___resumeException($33|0);
  // unreachable;
 }
 HEAP32[$9>>2] = $25;
 __THREW__ = 0;
 invoke_viii($28|0,($16|0),($8|0),($9|0));
 $29 = __THREW__; __THREW__ = 0;
 $30 = $29&1;
 if ($30) {
  $31 = ___cxa_find_matching_catch_2()|0;
  $32 = tempRet0;
  $10 = $31;
  $11 = $32;
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($8);
  $33 = $10;
  $34 = $11;
  ___resumeException($33|0);
  // unreachable;
 } else {
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($8);
  STACKTOP = sp;return;
 }
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEERKiEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 4;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEERKiEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS6_11char_traitsIcEENS6_9allocatorIcEEEERKiEEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal10getContextIM6MyJsonFvRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEERKiEEEPT_RKSG_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0);
 $3 = $1;
 $$field = HEAP32[$3>>2]|0;
 $$index1 = ((($3)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 HEAP32[$2>>2] = $$field;
 $$index5 = ((($2)) + 4|0);
 HEAP32[$$index5>>2] = $$field2;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS6_11char_traitsIcEENS6_9allocatorIcEEEERKiEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3788|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJviiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (7200|0);
}
function __ZN10emscripten8internal13MethodInvokerIM6MyJsonFvRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEESB_EvPS2_JSB_SB_EE6invokeERKSD_SE_PNS0_11BindingTypeIS9_EUt_ESL_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $8 = sp + 20|0;
 $9 = sp + 8|0;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $12 = $5;
 $13 = (__ZN10emscripten8internal11BindingTypeIP6MyJsonE12fromWireTypeES3_($12)|0);
 $14 = $4;
 $$field = HEAP32[$14>>2]|0;
 $$index1 = ((($14)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 $15 = $$field2 >> 1;
 $16 = (($13) + ($15)|0);
 $17 = $$field2 & 1;
 $18 = ($17|0)!=(0);
 if ($18) {
  $19 = HEAP32[$16>>2]|0;
  $20 = (($19) + ($$field)|0);
  $21 = HEAP32[$20>>2]|0;
  $27 = $21;
 } else {
  $22 = $$field;
  $27 = $22;
 }
 $23 = $6;
 __ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE12fromWireTypeEPNS9_Ut_E($8,$23);
 $24 = $7;
 __THREW__ = 0;
 invoke_vii(120,($9|0),($24|0));
 $25 = __THREW__; __THREW__ = 0;
 $26 = $25&1;
 if ($26) {
  $30 = ___cxa_find_matching_catch_2()|0;
  $31 = tempRet0;
  $10 = $30;
  $11 = $31;
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($8);
  $34 = $10;
  $35 = $11;
  ___resumeException($34|0);
  // unreachable;
 }
 __THREW__ = 0;
 invoke_viii($27|0,($16|0),($8|0),($9|0));
 $28 = __THREW__; __THREW__ = 0;
 $29 = $28&1;
 if (!($29)) {
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($9);
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($8);
  STACKTOP = sp;return;
 }
 $32 = ___cxa_find_matching_catch_2()|0;
 $33 = tempRet0;
 $10 = $32;
 $11 = $33;
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($9);
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($8);
 $34 = $10;
 $35 = $11;
 ___resumeException($34|0);
 // unreachable;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEESF_EE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 4;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS7_11char_traitsIcEENS7_9allocatorIcEEEESF_EE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS6_11char_traitsIcEENS6_9allocatorIcEEEESE_EEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal10getContextIM6MyJsonFvRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEESB_EEEPT_RKSE_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0);
 $3 = $1;
 $$field = HEAP32[$3>>2]|0;
 $$index1 = ((($3)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 HEAP32[$2>>2] = $$field;
 $$index5 = ((($2)) + 4|0);
 HEAP32[$$index5>>2] = $$field2;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI6MyJsonEERKNSt3__212basic_stringIcNS6_11char_traitsIcEENS6_9allocatorIcEEEESE_EEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3804|0);
}
function __GLOBAL__sub_I_json_handler_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___cxx_global_var_init();
 return;
}
function __GLOBAL__sub_I_bind_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___cxx_global_var_init_2();
 return;
}
function ___cxx_global_var_init_2() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN53EmscriptenBindingInitializer_native_and_builtin_typesC2Ev(12306);
 return;
}
function __ZN53EmscriptenBindingInitializer_native_and_builtin_typesC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIvE3getEv()|0);
 __embind_register_void(($2|0),(7206|0));
 $3 = (__ZN10emscripten8internal6TypeIDIbE3getEv()|0);
 __embind_register_bool(($3|0),(7211|0),1,1,0);
 __ZN12_GLOBAL__N_1L16register_integerIcEEvPKc(7216);
 __ZN12_GLOBAL__N_1L16register_integerIaEEvPKc(7221);
 __ZN12_GLOBAL__N_1L16register_integerIhEEvPKc(7233);
 __ZN12_GLOBAL__N_1L16register_integerIsEEvPKc(7247);
 __ZN12_GLOBAL__N_1L16register_integerItEEvPKc(7253);
 __ZN12_GLOBAL__N_1L16register_integerIiEEvPKc(7268);
 __ZN12_GLOBAL__N_1L16register_integerIjEEvPKc(7272);
 __ZN12_GLOBAL__N_1L16register_integerIlEEvPKc(7285);
 __ZN12_GLOBAL__N_1L16register_integerImEEvPKc(7290);
 __ZN12_GLOBAL__N_1L14register_floatIfEEvPKc(7304);
 __ZN12_GLOBAL__N_1L14register_floatIdEEvPKc(7310);
 $4 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv()|0);
 __embind_register_std_string(($4|0),(7317|0));
 $5 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv()|0);
 __embind_register_std_string(($5|0),(7329|0));
 $6 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv()|0);
 __embind_register_std_wstring(($6|0),4,(7362|0));
 $7 = (__ZN10emscripten8internal6TypeIDINS_3valEE3getEv()|0);
 __embind_register_emval(($7|0),(7375|0));
 __ZN12_GLOBAL__N_1L20register_memory_viewIcEEvPKc(7391);
 __ZN12_GLOBAL__N_1L20register_memory_viewIaEEvPKc(7421);
 __ZN12_GLOBAL__N_1L20register_memory_viewIhEEvPKc(7458);
 __ZN12_GLOBAL__N_1L20register_memory_viewIsEEvPKc(7497);
 __ZN12_GLOBAL__N_1L20register_memory_viewItEEvPKc(7528);
 __ZN12_GLOBAL__N_1L20register_memory_viewIiEEvPKc(7568);
 __ZN12_GLOBAL__N_1L20register_memory_viewIjEEvPKc(7597);
 __ZN12_GLOBAL__N_1L20register_memory_viewIlEEvPKc(7635);
 __ZN12_GLOBAL__N_1L20register_memory_viewImEEvPKc(7665);
 __ZN12_GLOBAL__N_1L20register_memory_viewIaEEvPKc(7704);
 __ZN12_GLOBAL__N_1L20register_memory_viewIhEEvPKc(7736);
 __ZN12_GLOBAL__N_1L20register_memory_viewIsEEvPKc(7769);
 __ZN12_GLOBAL__N_1L20register_memory_viewItEEvPKc(7802);
 __ZN12_GLOBAL__N_1L20register_memory_viewIiEEvPKc(7836);
 __ZN12_GLOBAL__N_1L20register_memory_viewIjEEvPKc(7869);
 __ZN12_GLOBAL__N_1L20register_memory_viewIfEEvPKc(7903);
 __ZN12_GLOBAL__N_1L20register_memory_viewIdEEvPKc(7934);
 __ZN12_GLOBAL__N_1L20register_memory_viewIeEEvPKc(7966);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDIvE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIvE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal6TypeIDIbE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIbE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_1L16register_integerIcEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIcE3getEv()|0);
 $3 = $1;
 $4 = -128 << 24 >> 24;
 $5 = 127 << 24 >> 24;
 __embind_register_integer(($2|0),($3|0),1,($4|0),($5|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIaEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIaE3getEv()|0);
 $3 = $1;
 $4 = -128 << 24 >> 24;
 $5 = 127 << 24 >> 24;
 __embind_register_integer(($2|0),($3|0),1,($4|0),($5|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIhEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIhE3getEv()|0);
 $3 = $1;
 $4 = 0;
 $5 = 255;
 __embind_register_integer(($2|0),($3|0),1,($4|0),($5|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIsEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIsE3getEv()|0);
 $3 = $1;
 $4 = -32768 << 16 >> 16;
 $5 = 32767 << 16 >> 16;
 __embind_register_integer(($2|0),($3|0),2,($4|0),($5|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerItEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDItE3getEv()|0);
 $3 = $1;
 $4 = 0;
 $5 = 65535;
 __embind_register_integer(($2|0),($3|0),2,($4|0),($5|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIiEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIiE3getEv()|0);
 $3 = $1;
 __embind_register_integer(($2|0),($3|0),4,-2147483648,2147483647);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIjEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIjE3getEv()|0);
 $3 = $1;
 __embind_register_integer(($2|0),($3|0),4,0,-1);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIlEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIlE3getEv()|0);
 $3 = $1;
 __embind_register_integer(($2|0),($3|0),4,-2147483648,2147483647);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerImEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDImE3getEv()|0);
 $3 = $1;
 __embind_register_integer(($2|0),($3|0),4,0,-1);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L14register_floatIfEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIfE3getEv()|0);
 $3 = $1;
 __embind_register_float(($2|0),($3|0),4);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L14register_floatIdEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIdE3getEv()|0);
 $3 = $1;
 __embind_register_float(($2|0),($3|0),8);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal6TypeIDINS_3valEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_3valEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIcEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIcEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIcEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIaEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIaEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIaEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIhEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIhEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIhEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIsEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIsEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIsEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewItEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewItEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexItEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIiEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIiEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIiEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIjEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIjEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIjEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIlEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIlEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIlEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewImEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewImEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexImEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIfEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIfEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIfEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIdEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIdEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIdEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIeEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIeEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIeEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIeEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIeEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIeEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 7;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIeEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3248|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIdEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIdEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIdEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 7;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIdEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3256|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIfEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIfEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIfEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 6;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIfEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3264|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewImEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewImEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexImEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 5;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewImEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3272|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIlEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIlEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIlEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 4;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIlEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3280|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIjEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIjEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIjEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 5;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIjEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3288|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIiEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIiEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIiEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 4;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIiEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3296|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewItEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewItEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexItEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 3;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewItEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3304|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIsEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIsEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIsEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 2;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIsEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3312|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIhEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIhEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIhEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 1;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIhEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3320|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIaEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIaEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIaEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIaEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3328|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIcEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIcEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIcEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIcEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3336|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_3valEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3344|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3352|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3376|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3224|0);
}
function __ZN10emscripten8internal6TypeIDIdE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIdE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIdE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3664|0);
}
function __ZN10emscripten8internal6TypeIDIfE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIfE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIfE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3656|0);
}
function __ZN10emscripten8internal6TypeIDImE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDImE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDImE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3648|0);
}
function __ZN10emscripten8internal6TypeIDIlE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIlE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIlE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3640|0);
}
function __ZN10emscripten8internal6TypeIDIjE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIjE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIjE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3632|0);
}
function __ZN10emscripten8internal6TypeIDIiE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIiE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIiE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3624|0);
}
function __ZN10emscripten8internal6TypeIDItE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDItE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDItE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3616|0);
}
function __ZN10emscripten8internal6TypeIDIsE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIsE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIsE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3608|0);
}
function __ZN10emscripten8internal6TypeIDIhE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIhE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIhE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3592|0);
}
function __ZN10emscripten8internal6TypeIDIaE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIaE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIaE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3600|0);
}
function __ZN10emscripten8internal6TypeIDIcE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIcE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIcE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3584|0);
}
function __ZN10emscripten8internal11LightTypeIDIbE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3576|0);
}
function __ZN10emscripten8internal11LightTypeIDIvE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3560|0);
}
function ___getTypeName($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $2;
 $1 = $3;
 $4 = $1;
 $5 = ((($4)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (___strdup($6)|0);
 STACKTOP = sp;return ($7|0);
}
function _malloc($0) {
 $0 = $0|0;
 var $$$0172$i = 0, $$$0173$i = 0, $$$4236$i = 0, $$$4329$i = 0, $$$i = 0, $$0 = 0, $$0$i = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i20$i = 0, $$01$i$i = 0, $$0172$lcssa$i = 0, $$01726$i = 0, $$0173$lcssa$i = 0, $$01735$i = 0, $$0192 = 0, $$0194 = 0, $$0201$i$i = 0, $$0202$i$i = 0, $$0206$i$i = 0;
 var $$0207$i$i = 0, $$024370$i = 0, $$0260$i$i = 0, $$0261$i$i = 0, $$0262$i$i = 0, $$0268$i$i = 0, $$0269$i$i = 0, $$0320$i = 0, $$0322$i = 0, $$0323$i = 0, $$0325$i = 0, $$0331$i = 0, $$0336$i = 0, $$0337$$i = 0, $$0337$i = 0, $$0339$i = 0, $$0340$i = 0, $$0345$i = 0, $$1176$i = 0, $$1178$i = 0;
 var $$124469$i = 0, $$1264$i$i = 0, $$1266$i$i = 0, $$1321$i = 0, $$1326$i = 0, $$1341$i = 0, $$1347$i = 0, $$1351$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2333$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i200 = 0, $$3328$i = 0, $$3349$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$411$i = 0;
 var $$4236$i = 0, $$4329$lcssa$i = 0, $$432910$i = 0, $$4335$$4$i = 0, $$4335$ph$i = 0, $$43359$i = 0, $$723947$i = 0, $$748$i = 0, $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i17$i = 0, $$pre$i195 = 0, $$pre$i210 = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i18$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phiZ2D = 0, $$sink1$i = 0;
 var $$sink1$i$i = 0, $$sink14$i = 0, $$sink2$i = 0, $$sink2$i204 = 0, $$sink3$i = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0;
 var $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0;
 var $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0;
 var $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0;
 var $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0;
 var $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0;
 var $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0;
 var $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0;
 var $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0;
 var $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0;
 var $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0;
 var $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0;
 var $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0;
 var $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0;
 var $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0;
 var $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0;
 var $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0;
 var $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0;
 var $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0;
 var $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0;
 var $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0;
 var $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0;
 var $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0;
 var $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0;
 var $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0;
 var $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0;
 var $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0;
 var $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0;
 var $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0;
 var $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0;
 var $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0;
 var $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0;
 var $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0;
 var $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0;
 var $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0;
 var $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0;
 var $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0;
 var $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0;
 var $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0;
 var $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0, $814 = 0;
 var $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0, $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0, $832 = 0;
 var $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0, $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0, $850 = 0;
 var $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0, $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0, $869 = 0;
 var $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0, $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0, $887 = 0;
 var $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0, $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0, $904 = 0;
 var $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0, $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0, $922 = 0;
 var $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0, $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0, $940 = 0;
 var $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0, $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0, $959 = 0;
 var $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0, $970 = 0, $98 = 0, $99 = 0, $cond$i = 0, $cond$i$i = 0, $cond$i208 = 0, $exitcond$i$i = 0, $not$$i = 0;
 var $not$$i$i = 0, $not$$i197 = 0, $not$$i209 = 0, $not$1$i = 0, $not$1$i203 = 0, $not$3$i = 0, $not$5$i = 0, $or$cond$i = 0, $or$cond$i201 = 0, $or$cond1$i = 0, $or$cond10$i = 0, $or$cond11$i = 0, $or$cond11$not$i = 0, $or$cond12$i = 0, $or$cond2$i = 0, $or$cond2$i199 = 0, $or$cond49$i = 0, $or$cond5$i = 0, $or$cond50$i = 0, $or$cond7$i = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 $2 = ($0>>>0)<(245);
 do {
  if ($2) {
   $3 = ($0>>>0)<(11);
   $4 = (($0) + 11)|0;
   $5 = $4 & -8;
   $6 = $3 ? 16 : $5;
   $7 = $6 >>> 3;
   $8 = HEAP32[2930]|0;
   $9 = $8 >>> $7;
   $10 = $9 & 3;
   $11 = ($10|0)==(0);
   if (!($11)) {
    $12 = $9 & 1;
    $13 = $12 ^ 1;
    $14 = (($13) + ($7))|0;
    $15 = $14 << 1;
    $16 = (11760 + ($15<<2)|0);
    $17 = ((($16)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ((($18)) + 8|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = ($16|0)==($20|0);
    if ($21) {
     $22 = 1 << $14;
     $23 = $22 ^ -1;
     $24 = $8 & $23;
     HEAP32[2930] = $24;
    } else {
     $25 = ((($20)) + 12|0);
     HEAP32[$25>>2] = $16;
     HEAP32[$17>>2] = $20;
    }
    $26 = $14 << 3;
    $27 = $26 | 3;
    $28 = ((($18)) + 4|0);
    HEAP32[$28>>2] = $27;
    $29 = (($18) + ($26)|0);
    $30 = ((($29)) + 4|0);
    $31 = HEAP32[$30>>2]|0;
    $32 = $31 | 1;
    HEAP32[$30>>2] = $32;
    $$0 = $19;
    STACKTOP = sp;return ($$0|0);
   }
   $33 = HEAP32[(11728)>>2]|0;
   $34 = ($6>>>0)>($33>>>0);
   if ($34) {
    $35 = ($9|0)==(0);
    if (!($35)) {
     $36 = $9 << $7;
     $37 = 2 << $7;
     $38 = (0 - ($37))|0;
     $39 = $37 | $38;
     $40 = $36 & $39;
     $41 = (0 - ($40))|0;
     $42 = $40 & $41;
     $43 = (($42) + -1)|0;
     $44 = $43 >>> 12;
     $45 = $44 & 16;
     $46 = $43 >>> $45;
     $47 = $46 >>> 5;
     $48 = $47 & 8;
     $49 = $48 | $45;
     $50 = $46 >>> $48;
     $51 = $50 >>> 2;
     $52 = $51 & 4;
     $53 = $49 | $52;
     $54 = $50 >>> $52;
     $55 = $54 >>> 1;
     $56 = $55 & 2;
     $57 = $53 | $56;
     $58 = $54 >>> $56;
     $59 = $58 >>> 1;
     $60 = $59 & 1;
     $61 = $57 | $60;
     $62 = $58 >>> $60;
     $63 = (($61) + ($62))|0;
     $64 = $63 << 1;
     $65 = (11760 + ($64<<2)|0);
     $66 = ((($65)) + 8|0);
     $67 = HEAP32[$66>>2]|0;
     $68 = ((($67)) + 8|0);
     $69 = HEAP32[$68>>2]|0;
     $70 = ($65|0)==($69|0);
     if ($70) {
      $71 = 1 << $63;
      $72 = $71 ^ -1;
      $73 = $8 & $72;
      HEAP32[2930] = $73;
      $90 = $73;
     } else {
      $74 = ((($69)) + 12|0);
      HEAP32[$74>>2] = $65;
      HEAP32[$66>>2] = $69;
      $90 = $8;
     }
     $75 = $63 << 3;
     $76 = (($75) - ($6))|0;
     $77 = $6 | 3;
     $78 = ((($67)) + 4|0);
     HEAP32[$78>>2] = $77;
     $79 = (($67) + ($6)|0);
     $80 = $76 | 1;
     $81 = ((($79)) + 4|0);
     HEAP32[$81>>2] = $80;
     $82 = (($79) + ($76)|0);
     HEAP32[$82>>2] = $76;
     $83 = ($33|0)==(0);
     if (!($83)) {
      $84 = HEAP32[(11740)>>2]|0;
      $85 = $33 >>> 3;
      $86 = $85 << 1;
      $87 = (11760 + ($86<<2)|0);
      $88 = 1 << $85;
      $89 = $90 & $88;
      $91 = ($89|0)==(0);
      if ($91) {
       $92 = $90 | $88;
       HEAP32[2930] = $92;
       $$pre = ((($87)) + 8|0);
       $$0194 = $87;$$pre$phiZ2D = $$pre;
      } else {
       $93 = ((($87)) + 8|0);
       $94 = HEAP32[$93>>2]|0;
       $$0194 = $94;$$pre$phiZ2D = $93;
      }
      HEAP32[$$pre$phiZ2D>>2] = $84;
      $95 = ((($$0194)) + 12|0);
      HEAP32[$95>>2] = $84;
      $96 = ((($84)) + 8|0);
      HEAP32[$96>>2] = $$0194;
      $97 = ((($84)) + 12|0);
      HEAP32[$97>>2] = $87;
     }
     HEAP32[(11728)>>2] = $76;
     HEAP32[(11740)>>2] = $79;
     $$0 = $68;
     STACKTOP = sp;return ($$0|0);
    }
    $98 = HEAP32[(11724)>>2]|0;
    $99 = ($98|0)==(0);
    if ($99) {
     $$0192 = $6;
    } else {
     $100 = (0 - ($98))|0;
     $101 = $98 & $100;
     $102 = (($101) + -1)|0;
     $103 = $102 >>> 12;
     $104 = $103 & 16;
     $105 = $102 >>> $104;
     $106 = $105 >>> 5;
     $107 = $106 & 8;
     $108 = $107 | $104;
     $109 = $105 >>> $107;
     $110 = $109 >>> 2;
     $111 = $110 & 4;
     $112 = $108 | $111;
     $113 = $109 >>> $111;
     $114 = $113 >>> 1;
     $115 = $114 & 2;
     $116 = $112 | $115;
     $117 = $113 >>> $115;
     $118 = $117 >>> 1;
     $119 = $118 & 1;
     $120 = $116 | $119;
     $121 = $117 >>> $119;
     $122 = (($120) + ($121))|0;
     $123 = (12024 + ($122<<2)|0);
     $124 = HEAP32[$123>>2]|0;
     $125 = ((($124)) + 4|0);
     $126 = HEAP32[$125>>2]|0;
     $127 = $126 & -8;
     $128 = (($127) - ($6))|0;
     $129 = ((($124)) + 16|0);
     $130 = HEAP32[$129>>2]|0;
     $not$3$i = ($130|0)==(0|0);
     $$sink14$i = $not$3$i&1;
     $131 = (((($124)) + 16|0) + ($$sink14$i<<2)|0);
     $132 = HEAP32[$131>>2]|0;
     $133 = ($132|0)==(0|0);
     if ($133) {
      $$0172$lcssa$i = $124;$$0173$lcssa$i = $128;
     } else {
      $$01726$i = $124;$$01735$i = $128;$135 = $132;
      while(1) {
       $134 = ((($135)) + 4|0);
       $136 = HEAP32[$134>>2]|0;
       $137 = $136 & -8;
       $138 = (($137) - ($6))|0;
       $139 = ($138>>>0)<($$01735$i>>>0);
       $$$0173$i = $139 ? $138 : $$01735$i;
       $$$0172$i = $139 ? $135 : $$01726$i;
       $140 = ((($135)) + 16|0);
       $141 = HEAP32[$140>>2]|0;
       $not$$i = ($141|0)==(0|0);
       $$sink1$i = $not$$i&1;
       $142 = (((($135)) + 16|0) + ($$sink1$i<<2)|0);
       $143 = HEAP32[$142>>2]|0;
       $144 = ($143|0)==(0|0);
       if ($144) {
        $$0172$lcssa$i = $$$0172$i;$$0173$lcssa$i = $$$0173$i;
        break;
       } else {
        $$01726$i = $$$0172$i;$$01735$i = $$$0173$i;$135 = $143;
       }
      }
     }
     $145 = (($$0172$lcssa$i) + ($6)|0);
     $146 = ($$0172$lcssa$i>>>0)<($145>>>0);
     if ($146) {
      $147 = ((($$0172$lcssa$i)) + 24|0);
      $148 = HEAP32[$147>>2]|0;
      $149 = ((($$0172$lcssa$i)) + 12|0);
      $150 = HEAP32[$149>>2]|0;
      $151 = ($150|0)==($$0172$lcssa$i|0);
      do {
       if ($151) {
        $156 = ((($$0172$lcssa$i)) + 20|0);
        $157 = HEAP32[$156>>2]|0;
        $158 = ($157|0)==(0|0);
        if ($158) {
         $159 = ((($$0172$lcssa$i)) + 16|0);
         $160 = HEAP32[$159>>2]|0;
         $161 = ($160|0)==(0|0);
         if ($161) {
          $$3$i = 0;
          break;
         } else {
          $$1176$i = $160;$$1178$i = $159;
         }
        } else {
         $$1176$i = $157;$$1178$i = $156;
        }
        while(1) {
         $162 = ((($$1176$i)) + 20|0);
         $163 = HEAP32[$162>>2]|0;
         $164 = ($163|0)==(0|0);
         if (!($164)) {
          $$1176$i = $163;$$1178$i = $162;
          continue;
         }
         $165 = ((($$1176$i)) + 16|0);
         $166 = HEAP32[$165>>2]|0;
         $167 = ($166|0)==(0|0);
         if ($167) {
          break;
         } else {
          $$1176$i = $166;$$1178$i = $165;
         }
        }
        HEAP32[$$1178$i>>2] = 0;
        $$3$i = $$1176$i;
       } else {
        $152 = ((($$0172$lcssa$i)) + 8|0);
        $153 = HEAP32[$152>>2]|0;
        $154 = ((($153)) + 12|0);
        HEAP32[$154>>2] = $150;
        $155 = ((($150)) + 8|0);
        HEAP32[$155>>2] = $153;
        $$3$i = $150;
       }
      } while(0);
      $168 = ($148|0)==(0|0);
      do {
       if (!($168)) {
        $169 = ((($$0172$lcssa$i)) + 28|0);
        $170 = HEAP32[$169>>2]|0;
        $171 = (12024 + ($170<<2)|0);
        $172 = HEAP32[$171>>2]|0;
        $173 = ($$0172$lcssa$i|0)==($172|0);
        if ($173) {
         HEAP32[$171>>2] = $$3$i;
         $cond$i = ($$3$i|0)==(0|0);
         if ($cond$i) {
          $174 = 1 << $170;
          $175 = $174 ^ -1;
          $176 = $98 & $175;
          HEAP32[(11724)>>2] = $176;
          break;
         }
        } else {
         $177 = ((($148)) + 16|0);
         $178 = HEAP32[$177>>2]|0;
         $not$1$i = ($178|0)!=($$0172$lcssa$i|0);
         $$sink2$i = $not$1$i&1;
         $179 = (((($148)) + 16|0) + ($$sink2$i<<2)|0);
         HEAP32[$179>>2] = $$3$i;
         $180 = ($$3$i|0)==(0|0);
         if ($180) {
          break;
         }
        }
        $181 = ((($$3$i)) + 24|0);
        HEAP32[$181>>2] = $148;
        $182 = ((($$0172$lcssa$i)) + 16|0);
        $183 = HEAP32[$182>>2]|0;
        $184 = ($183|0)==(0|0);
        if (!($184)) {
         $185 = ((($$3$i)) + 16|0);
         HEAP32[$185>>2] = $183;
         $186 = ((($183)) + 24|0);
         HEAP32[$186>>2] = $$3$i;
        }
        $187 = ((($$0172$lcssa$i)) + 20|0);
        $188 = HEAP32[$187>>2]|0;
        $189 = ($188|0)==(0|0);
        if (!($189)) {
         $190 = ((($$3$i)) + 20|0);
         HEAP32[$190>>2] = $188;
         $191 = ((($188)) + 24|0);
         HEAP32[$191>>2] = $$3$i;
        }
       }
      } while(0);
      $192 = ($$0173$lcssa$i>>>0)<(16);
      if ($192) {
       $193 = (($$0173$lcssa$i) + ($6))|0;
       $194 = $193 | 3;
       $195 = ((($$0172$lcssa$i)) + 4|0);
       HEAP32[$195>>2] = $194;
       $196 = (($$0172$lcssa$i) + ($193)|0);
       $197 = ((($196)) + 4|0);
       $198 = HEAP32[$197>>2]|0;
       $199 = $198 | 1;
       HEAP32[$197>>2] = $199;
      } else {
       $200 = $6 | 3;
       $201 = ((($$0172$lcssa$i)) + 4|0);
       HEAP32[$201>>2] = $200;
       $202 = $$0173$lcssa$i | 1;
       $203 = ((($145)) + 4|0);
       HEAP32[$203>>2] = $202;
       $204 = (($145) + ($$0173$lcssa$i)|0);
       HEAP32[$204>>2] = $$0173$lcssa$i;
       $205 = ($33|0)==(0);
       if (!($205)) {
        $206 = HEAP32[(11740)>>2]|0;
        $207 = $33 >>> 3;
        $208 = $207 << 1;
        $209 = (11760 + ($208<<2)|0);
        $210 = 1 << $207;
        $211 = $8 & $210;
        $212 = ($211|0)==(0);
        if ($212) {
         $213 = $8 | $210;
         HEAP32[2930] = $213;
         $$pre$i = ((($209)) + 8|0);
         $$0$i = $209;$$pre$phi$iZ2D = $$pre$i;
        } else {
         $214 = ((($209)) + 8|0);
         $215 = HEAP32[$214>>2]|0;
         $$0$i = $215;$$pre$phi$iZ2D = $214;
        }
        HEAP32[$$pre$phi$iZ2D>>2] = $206;
        $216 = ((($$0$i)) + 12|0);
        HEAP32[$216>>2] = $206;
        $217 = ((($206)) + 8|0);
        HEAP32[$217>>2] = $$0$i;
        $218 = ((($206)) + 12|0);
        HEAP32[$218>>2] = $209;
       }
       HEAP32[(11728)>>2] = $$0173$lcssa$i;
       HEAP32[(11740)>>2] = $145;
      }
      $219 = ((($$0172$lcssa$i)) + 8|0);
      $$0 = $219;
      STACKTOP = sp;return ($$0|0);
     } else {
      $$0192 = $6;
     }
    }
   } else {
    $$0192 = $6;
   }
  } else {
   $220 = ($0>>>0)>(4294967231);
   if ($220) {
    $$0192 = -1;
   } else {
    $221 = (($0) + 11)|0;
    $222 = $221 & -8;
    $223 = HEAP32[(11724)>>2]|0;
    $224 = ($223|0)==(0);
    if ($224) {
     $$0192 = $222;
    } else {
     $225 = (0 - ($222))|0;
     $226 = $221 >>> 8;
     $227 = ($226|0)==(0);
     if ($227) {
      $$0336$i = 0;
     } else {
      $228 = ($222>>>0)>(16777215);
      if ($228) {
       $$0336$i = 31;
      } else {
       $229 = (($226) + 1048320)|0;
       $230 = $229 >>> 16;
       $231 = $230 & 8;
       $232 = $226 << $231;
       $233 = (($232) + 520192)|0;
       $234 = $233 >>> 16;
       $235 = $234 & 4;
       $236 = $235 | $231;
       $237 = $232 << $235;
       $238 = (($237) + 245760)|0;
       $239 = $238 >>> 16;
       $240 = $239 & 2;
       $241 = $236 | $240;
       $242 = (14 - ($241))|0;
       $243 = $237 << $240;
       $244 = $243 >>> 15;
       $245 = (($242) + ($244))|0;
       $246 = $245 << 1;
       $247 = (($245) + 7)|0;
       $248 = $222 >>> $247;
       $249 = $248 & 1;
       $250 = $249 | $246;
       $$0336$i = $250;
      }
     }
     $251 = (12024 + ($$0336$i<<2)|0);
     $252 = HEAP32[$251>>2]|0;
     $253 = ($252|0)==(0|0);
     L74: do {
      if ($253) {
       $$2333$i = 0;$$3$i200 = 0;$$3328$i = $225;
       label = 57;
      } else {
       $254 = ($$0336$i|0)==(31);
       $255 = $$0336$i >>> 1;
       $256 = (25 - ($255))|0;
       $257 = $254 ? 0 : $256;
       $258 = $222 << $257;
       $$0320$i = 0;$$0325$i = $225;$$0331$i = $252;$$0337$i = $258;$$0340$i = 0;
       while(1) {
        $259 = ((($$0331$i)) + 4|0);
        $260 = HEAP32[$259>>2]|0;
        $261 = $260 & -8;
        $262 = (($261) - ($222))|0;
        $263 = ($262>>>0)<($$0325$i>>>0);
        if ($263) {
         $264 = ($262|0)==(0);
         if ($264) {
          $$411$i = $$0331$i;$$432910$i = 0;$$43359$i = $$0331$i;
          label = 61;
          break L74;
         } else {
          $$1321$i = $$0331$i;$$1326$i = $262;
         }
        } else {
         $$1321$i = $$0320$i;$$1326$i = $$0325$i;
        }
        $265 = ((($$0331$i)) + 20|0);
        $266 = HEAP32[$265>>2]|0;
        $267 = $$0337$i >>> 31;
        $268 = (((($$0331$i)) + 16|0) + ($267<<2)|0);
        $269 = HEAP32[$268>>2]|0;
        $270 = ($266|0)==(0|0);
        $271 = ($266|0)==($269|0);
        $or$cond2$i199 = $270 | $271;
        $$1341$i = $or$cond2$i199 ? $$0340$i : $266;
        $272 = ($269|0)==(0|0);
        $not$5$i = $272 ^ 1;
        $273 = $not$5$i&1;
        $$0337$$i = $$0337$i << $273;
        if ($272) {
         $$2333$i = $$1341$i;$$3$i200 = $$1321$i;$$3328$i = $$1326$i;
         label = 57;
         break;
        } else {
         $$0320$i = $$1321$i;$$0325$i = $$1326$i;$$0331$i = $269;$$0337$i = $$0337$$i;$$0340$i = $$1341$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 57) {
      $274 = ($$2333$i|0)==(0|0);
      $275 = ($$3$i200|0)==(0|0);
      $or$cond$i201 = $274 & $275;
      if ($or$cond$i201) {
       $276 = 2 << $$0336$i;
       $277 = (0 - ($276))|0;
       $278 = $276 | $277;
       $279 = $223 & $278;
       $280 = ($279|0)==(0);
       if ($280) {
        $$0192 = $222;
        break;
       }
       $281 = (0 - ($279))|0;
       $282 = $279 & $281;
       $283 = (($282) + -1)|0;
       $284 = $283 >>> 12;
       $285 = $284 & 16;
       $286 = $283 >>> $285;
       $287 = $286 >>> 5;
       $288 = $287 & 8;
       $289 = $288 | $285;
       $290 = $286 >>> $288;
       $291 = $290 >>> 2;
       $292 = $291 & 4;
       $293 = $289 | $292;
       $294 = $290 >>> $292;
       $295 = $294 >>> 1;
       $296 = $295 & 2;
       $297 = $293 | $296;
       $298 = $294 >>> $296;
       $299 = $298 >>> 1;
       $300 = $299 & 1;
       $301 = $297 | $300;
       $302 = $298 >>> $300;
       $303 = (($301) + ($302))|0;
       $304 = (12024 + ($303<<2)|0);
       $305 = HEAP32[$304>>2]|0;
       $$4$ph$i = 0;$$4335$ph$i = $305;
      } else {
       $$4$ph$i = $$3$i200;$$4335$ph$i = $$2333$i;
      }
      $306 = ($$4335$ph$i|0)==(0|0);
      if ($306) {
       $$4$lcssa$i = $$4$ph$i;$$4329$lcssa$i = $$3328$i;
      } else {
       $$411$i = $$4$ph$i;$$432910$i = $$3328$i;$$43359$i = $$4335$ph$i;
       label = 61;
      }
     }
     if ((label|0) == 61) {
      while(1) {
       label = 0;
       $307 = ((($$43359$i)) + 4|0);
       $308 = HEAP32[$307>>2]|0;
       $309 = $308 & -8;
       $310 = (($309) - ($222))|0;
       $311 = ($310>>>0)<($$432910$i>>>0);
       $$$4329$i = $311 ? $310 : $$432910$i;
       $$4335$$4$i = $311 ? $$43359$i : $$411$i;
       $312 = ((($$43359$i)) + 16|0);
       $313 = HEAP32[$312>>2]|0;
       $not$1$i203 = ($313|0)==(0|0);
       $$sink2$i204 = $not$1$i203&1;
       $314 = (((($$43359$i)) + 16|0) + ($$sink2$i204<<2)|0);
       $315 = HEAP32[$314>>2]|0;
       $316 = ($315|0)==(0|0);
       if ($316) {
        $$4$lcssa$i = $$4335$$4$i;$$4329$lcssa$i = $$$4329$i;
        break;
       } else {
        $$411$i = $$4335$$4$i;$$432910$i = $$$4329$i;$$43359$i = $315;
        label = 61;
       }
      }
     }
     $317 = ($$4$lcssa$i|0)==(0|0);
     if ($317) {
      $$0192 = $222;
     } else {
      $318 = HEAP32[(11728)>>2]|0;
      $319 = (($318) - ($222))|0;
      $320 = ($$4329$lcssa$i>>>0)<($319>>>0);
      if ($320) {
       $321 = (($$4$lcssa$i) + ($222)|0);
       $322 = ($$4$lcssa$i>>>0)<($321>>>0);
       if (!($322)) {
        $$0 = 0;
        STACKTOP = sp;return ($$0|0);
       }
       $323 = ((($$4$lcssa$i)) + 24|0);
       $324 = HEAP32[$323>>2]|0;
       $325 = ((($$4$lcssa$i)) + 12|0);
       $326 = HEAP32[$325>>2]|0;
       $327 = ($326|0)==($$4$lcssa$i|0);
       do {
        if ($327) {
         $332 = ((($$4$lcssa$i)) + 20|0);
         $333 = HEAP32[$332>>2]|0;
         $334 = ($333|0)==(0|0);
         if ($334) {
          $335 = ((($$4$lcssa$i)) + 16|0);
          $336 = HEAP32[$335>>2]|0;
          $337 = ($336|0)==(0|0);
          if ($337) {
           $$3349$i = 0;
           break;
          } else {
           $$1347$i = $336;$$1351$i = $335;
          }
         } else {
          $$1347$i = $333;$$1351$i = $332;
         }
         while(1) {
          $338 = ((($$1347$i)) + 20|0);
          $339 = HEAP32[$338>>2]|0;
          $340 = ($339|0)==(0|0);
          if (!($340)) {
           $$1347$i = $339;$$1351$i = $338;
           continue;
          }
          $341 = ((($$1347$i)) + 16|0);
          $342 = HEAP32[$341>>2]|0;
          $343 = ($342|0)==(0|0);
          if ($343) {
           break;
          } else {
           $$1347$i = $342;$$1351$i = $341;
          }
         }
         HEAP32[$$1351$i>>2] = 0;
         $$3349$i = $$1347$i;
        } else {
         $328 = ((($$4$lcssa$i)) + 8|0);
         $329 = HEAP32[$328>>2]|0;
         $330 = ((($329)) + 12|0);
         HEAP32[$330>>2] = $326;
         $331 = ((($326)) + 8|0);
         HEAP32[$331>>2] = $329;
         $$3349$i = $326;
        }
       } while(0);
       $344 = ($324|0)==(0|0);
       do {
        if ($344) {
         $426 = $223;
        } else {
         $345 = ((($$4$lcssa$i)) + 28|0);
         $346 = HEAP32[$345>>2]|0;
         $347 = (12024 + ($346<<2)|0);
         $348 = HEAP32[$347>>2]|0;
         $349 = ($$4$lcssa$i|0)==($348|0);
         if ($349) {
          HEAP32[$347>>2] = $$3349$i;
          $cond$i208 = ($$3349$i|0)==(0|0);
          if ($cond$i208) {
           $350 = 1 << $346;
           $351 = $350 ^ -1;
           $352 = $223 & $351;
           HEAP32[(11724)>>2] = $352;
           $426 = $352;
           break;
          }
         } else {
          $353 = ((($324)) + 16|0);
          $354 = HEAP32[$353>>2]|0;
          $not$$i209 = ($354|0)!=($$4$lcssa$i|0);
          $$sink3$i = $not$$i209&1;
          $355 = (((($324)) + 16|0) + ($$sink3$i<<2)|0);
          HEAP32[$355>>2] = $$3349$i;
          $356 = ($$3349$i|0)==(0|0);
          if ($356) {
           $426 = $223;
           break;
          }
         }
         $357 = ((($$3349$i)) + 24|0);
         HEAP32[$357>>2] = $324;
         $358 = ((($$4$lcssa$i)) + 16|0);
         $359 = HEAP32[$358>>2]|0;
         $360 = ($359|0)==(0|0);
         if (!($360)) {
          $361 = ((($$3349$i)) + 16|0);
          HEAP32[$361>>2] = $359;
          $362 = ((($359)) + 24|0);
          HEAP32[$362>>2] = $$3349$i;
         }
         $363 = ((($$4$lcssa$i)) + 20|0);
         $364 = HEAP32[$363>>2]|0;
         $365 = ($364|0)==(0|0);
         if ($365) {
          $426 = $223;
         } else {
          $366 = ((($$3349$i)) + 20|0);
          HEAP32[$366>>2] = $364;
          $367 = ((($364)) + 24|0);
          HEAP32[$367>>2] = $$3349$i;
          $426 = $223;
         }
        }
       } while(0);
       $368 = ($$4329$lcssa$i>>>0)<(16);
       do {
        if ($368) {
         $369 = (($$4329$lcssa$i) + ($222))|0;
         $370 = $369 | 3;
         $371 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$371>>2] = $370;
         $372 = (($$4$lcssa$i) + ($369)|0);
         $373 = ((($372)) + 4|0);
         $374 = HEAP32[$373>>2]|0;
         $375 = $374 | 1;
         HEAP32[$373>>2] = $375;
        } else {
         $376 = $222 | 3;
         $377 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$377>>2] = $376;
         $378 = $$4329$lcssa$i | 1;
         $379 = ((($321)) + 4|0);
         HEAP32[$379>>2] = $378;
         $380 = (($321) + ($$4329$lcssa$i)|0);
         HEAP32[$380>>2] = $$4329$lcssa$i;
         $381 = $$4329$lcssa$i >>> 3;
         $382 = ($$4329$lcssa$i>>>0)<(256);
         if ($382) {
          $383 = $381 << 1;
          $384 = (11760 + ($383<<2)|0);
          $385 = HEAP32[2930]|0;
          $386 = 1 << $381;
          $387 = $385 & $386;
          $388 = ($387|0)==(0);
          if ($388) {
           $389 = $385 | $386;
           HEAP32[2930] = $389;
           $$pre$i210 = ((($384)) + 8|0);
           $$0345$i = $384;$$pre$phi$i211Z2D = $$pre$i210;
          } else {
           $390 = ((($384)) + 8|0);
           $391 = HEAP32[$390>>2]|0;
           $$0345$i = $391;$$pre$phi$i211Z2D = $390;
          }
          HEAP32[$$pre$phi$i211Z2D>>2] = $321;
          $392 = ((($$0345$i)) + 12|0);
          HEAP32[$392>>2] = $321;
          $393 = ((($321)) + 8|0);
          HEAP32[$393>>2] = $$0345$i;
          $394 = ((($321)) + 12|0);
          HEAP32[$394>>2] = $384;
          break;
         }
         $395 = $$4329$lcssa$i >>> 8;
         $396 = ($395|0)==(0);
         if ($396) {
          $$0339$i = 0;
         } else {
          $397 = ($$4329$lcssa$i>>>0)>(16777215);
          if ($397) {
           $$0339$i = 31;
          } else {
           $398 = (($395) + 1048320)|0;
           $399 = $398 >>> 16;
           $400 = $399 & 8;
           $401 = $395 << $400;
           $402 = (($401) + 520192)|0;
           $403 = $402 >>> 16;
           $404 = $403 & 4;
           $405 = $404 | $400;
           $406 = $401 << $404;
           $407 = (($406) + 245760)|0;
           $408 = $407 >>> 16;
           $409 = $408 & 2;
           $410 = $405 | $409;
           $411 = (14 - ($410))|0;
           $412 = $406 << $409;
           $413 = $412 >>> 15;
           $414 = (($411) + ($413))|0;
           $415 = $414 << 1;
           $416 = (($414) + 7)|0;
           $417 = $$4329$lcssa$i >>> $416;
           $418 = $417 & 1;
           $419 = $418 | $415;
           $$0339$i = $419;
          }
         }
         $420 = (12024 + ($$0339$i<<2)|0);
         $421 = ((($321)) + 28|0);
         HEAP32[$421>>2] = $$0339$i;
         $422 = ((($321)) + 16|0);
         $423 = ((($422)) + 4|0);
         HEAP32[$423>>2] = 0;
         HEAP32[$422>>2] = 0;
         $424 = 1 << $$0339$i;
         $425 = $426 & $424;
         $427 = ($425|0)==(0);
         if ($427) {
          $428 = $426 | $424;
          HEAP32[(11724)>>2] = $428;
          HEAP32[$420>>2] = $321;
          $429 = ((($321)) + 24|0);
          HEAP32[$429>>2] = $420;
          $430 = ((($321)) + 12|0);
          HEAP32[$430>>2] = $321;
          $431 = ((($321)) + 8|0);
          HEAP32[$431>>2] = $321;
          break;
         }
         $432 = HEAP32[$420>>2]|0;
         $433 = ($$0339$i|0)==(31);
         $434 = $$0339$i >>> 1;
         $435 = (25 - ($434))|0;
         $436 = $433 ? 0 : $435;
         $437 = $$4329$lcssa$i << $436;
         $$0322$i = $437;$$0323$i = $432;
         while(1) {
          $438 = ((($$0323$i)) + 4|0);
          $439 = HEAP32[$438>>2]|0;
          $440 = $439 & -8;
          $441 = ($440|0)==($$4329$lcssa$i|0);
          if ($441) {
           label = 97;
           break;
          }
          $442 = $$0322$i >>> 31;
          $443 = (((($$0323$i)) + 16|0) + ($442<<2)|0);
          $444 = $$0322$i << 1;
          $445 = HEAP32[$443>>2]|0;
          $446 = ($445|0)==(0|0);
          if ($446) {
           label = 96;
           break;
          } else {
           $$0322$i = $444;$$0323$i = $445;
          }
         }
         if ((label|0) == 96) {
          HEAP32[$443>>2] = $321;
          $447 = ((($321)) + 24|0);
          HEAP32[$447>>2] = $$0323$i;
          $448 = ((($321)) + 12|0);
          HEAP32[$448>>2] = $321;
          $449 = ((($321)) + 8|0);
          HEAP32[$449>>2] = $321;
          break;
         }
         else if ((label|0) == 97) {
          $450 = ((($$0323$i)) + 8|0);
          $451 = HEAP32[$450>>2]|0;
          $452 = ((($451)) + 12|0);
          HEAP32[$452>>2] = $321;
          HEAP32[$450>>2] = $321;
          $453 = ((($321)) + 8|0);
          HEAP32[$453>>2] = $451;
          $454 = ((($321)) + 12|0);
          HEAP32[$454>>2] = $$0323$i;
          $455 = ((($321)) + 24|0);
          HEAP32[$455>>2] = 0;
          break;
         }
        }
       } while(0);
       $456 = ((($$4$lcssa$i)) + 8|0);
       $$0 = $456;
       STACKTOP = sp;return ($$0|0);
      } else {
       $$0192 = $222;
      }
     }
    }
   }
  }
 } while(0);
 $457 = HEAP32[(11728)>>2]|0;
 $458 = ($457>>>0)<($$0192>>>0);
 if (!($458)) {
  $459 = (($457) - ($$0192))|0;
  $460 = HEAP32[(11740)>>2]|0;
  $461 = ($459>>>0)>(15);
  if ($461) {
   $462 = (($460) + ($$0192)|0);
   HEAP32[(11740)>>2] = $462;
   HEAP32[(11728)>>2] = $459;
   $463 = $459 | 1;
   $464 = ((($462)) + 4|0);
   HEAP32[$464>>2] = $463;
   $465 = (($462) + ($459)|0);
   HEAP32[$465>>2] = $459;
   $466 = $$0192 | 3;
   $467 = ((($460)) + 4|0);
   HEAP32[$467>>2] = $466;
  } else {
   HEAP32[(11728)>>2] = 0;
   HEAP32[(11740)>>2] = 0;
   $468 = $457 | 3;
   $469 = ((($460)) + 4|0);
   HEAP32[$469>>2] = $468;
   $470 = (($460) + ($457)|0);
   $471 = ((($470)) + 4|0);
   $472 = HEAP32[$471>>2]|0;
   $473 = $472 | 1;
   HEAP32[$471>>2] = $473;
  }
  $474 = ((($460)) + 8|0);
  $$0 = $474;
  STACKTOP = sp;return ($$0|0);
 }
 $475 = HEAP32[(11732)>>2]|0;
 $476 = ($475>>>0)>($$0192>>>0);
 if ($476) {
  $477 = (($475) - ($$0192))|0;
  HEAP32[(11732)>>2] = $477;
  $478 = HEAP32[(11744)>>2]|0;
  $479 = (($478) + ($$0192)|0);
  HEAP32[(11744)>>2] = $479;
  $480 = $477 | 1;
  $481 = ((($479)) + 4|0);
  HEAP32[$481>>2] = $480;
  $482 = $$0192 | 3;
  $483 = ((($478)) + 4|0);
  HEAP32[$483>>2] = $482;
  $484 = ((($478)) + 8|0);
  $$0 = $484;
  STACKTOP = sp;return ($$0|0);
 }
 $485 = HEAP32[3048]|0;
 $486 = ($485|0)==(0);
 if ($486) {
  HEAP32[(12200)>>2] = 4096;
  HEAP32[(12196)>>2] = 4096;
  HEAP32[(12204)>>2] = -1;
  HEAP32[(12208)>>2] = -1;
  HEAP32[(12212)>>2] = 0;
  HEAP32[(12164)>>2] = 0;
  $487 = $1;
  $488 = $487 & -16;
  $489 = $488 ^ 1431655768;
  HEAP32[$1>>2] = $489;
  HEAP32[3048] = $489;
  $493 = 4096;
 } else {
  $$pre$i195 = HEAP32[(12200)>>2]|0;
  $493 = $$pre$i195;
 }
 $490 = (($$0192) + 48)|0;
 $491 = (($$0192) + 47)|0;
 $492 = (($493) + ($491))|0;
 $494 = (0 - ($493))|0;
 $495 = $492 & $494;
 $496 = ($495>>>0)>($$0192>>>0);
 if (!($496)) {
  $$0 = 0;
  STACKTOP = sp;return ($$0|0);
 }
 $497 = HEAP32[(12160)>>2]|0;
 $498 = ($497|0)==(0);
 if (!($498)) {
  $499 = HEAP32[(12152)>>2]|0;
  $500 = (($499) + ($495))|0;
  $501 = ($500>>>0)<=($499>>>0);
  $502 = ($500>>>0)>($497>>>0);
  $or$cond1$i = $501 | $502;
  if ($or$cond1$i) {
   $$0 = 0;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $503 = HEAP32[(12164)>>2]|0;
 $504 = $503 & 4;
 $505 = ($504|0)==(0);
 L167: do {
  if ($505) {
   $506 = HEAP32[(11744)>>2]|0;
   $507 = ($506|0)==(0|0);
   L169: do {
    if ($507) {
     label = 118;
    } else {
     $$0$i20$i = (12168);
     while(1) {
      $508 = HEAP32[$$0$i20$i>>2]|0;
      $509 = ($508>>>0)>($506>>>0);
      if (!($509)) {
       $510 = ((($$0$i20$i)) + 4|0);
       $511 = HEAP32[$510>>2]|0;
       $512 = (($508) + ($511)|0);
       $513 = ($512>>>0)>($506>>>0);
       if ($513) {
        break;
       }
      }
      $514 = ((($$0$i20$i)) + 8|0);
      $515 = HEAP32[$514>>2]|0;
      $516 = ($515|0)==(0|0);
      if ($516) {
       label = 118;
       break L169;
      } else {
       $$0$i20$i = $515;
      }
     }
     $539 = (($492) - ($475))|0;
     $540 = $539 & $494;
     $541 = ($540>>>0)<(2147483647);
     if ($541) {
      $542 = (_sbrk(($540|0))|0);
      $543 = HEAP32[$$0$i20$i>>2]|0;
      $544 = HEAP32[$510>>2]|0;
      $545 = (($543) + ($544)|0);
      $546 = ($542|0)==($545|0);
      if ($546) {
       $547 = ($542|0)==((-1)|0);
       if ($547) {
        $$2234243136$i = $540;
       } else {
        $$723947$i = $540;$$748$i = $542;
        label = 135;
        break L167;
       }
      } else {
       $$2247$ph$i = $542;$$2253$ph$i = $540;
       label = 126;
      }
     } else {
      $$2234243136$i = 0;
     }
    }
   } while(0);
   do {
    if ((label|0) == 118) {
     $517 = (_sbrk(0)|0);
     $518 = ($517|0)==((-1)|0);
     if ($518) {
      $$2234243136$i = 0;
     } else {
      $519 = $517;
      $520 = HEAP32[(12196)>>2]|0;
      $521 = (($520) + -1)|0;
      $522 = $521 & $519;
      $523 = ($522|0)==(0);
      $524 = (($521) + ($519))|0;
      $525 = (0 - ($520))|0;
      $526 = $524 & $525;
      $527 = (($526) - ($519))|0;
      $528 = $523 ? 0 : $527;
      $$$i = (($528) + ($495))|0;
      $529 = HEAP32[(12152)>>2]|0;
      $530 = (($$$i) + ($529))|0;
      $531 = ($$$i>>>0)>($$0192>>>0);
      $532 = ($$$i>>>0)<(2147483647);
      $or$cond$i = $531 & $532;
      if ($or$cond$i) {
       $533 = HEAP32[(12160)>>2]|0;
       $534 = ($533|0)==(0);
       if (!($534)) {
        $535 = ($530>>>0)<=($529>>>0);
        $536 = ($530>>>0)>($533>>>0);
        $or$cond2$i = $535 | $536;
        if ($or$cond2$i) {
         $$2234243136$i = 0;
         break;
        }
       }
       $537 = (_sbrk(($$$i|0))|0);
       $538 = ($537|0)==($517|0);
       if ($538) {
        $$723947$i = $$$i;$$748$i = $517;
        label = 135;
        break L167;
       } else {
        $$2247$ph$i = $537;$$2253$ph$i = $$$i;
        label = 126;
       }
      } else {
       $$2234243136$i = 0;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 126) {
     $548 = (0 - ($$2253$ph$i))|0;
     $549 = ($$2247$ph$i|0)!=((-1)|0);
     $550 = ($$2253$ph$i>>>0)<(2147483647);
     $or$cond7$i = $550 & $549;
     $551 = ($490>>>0)>($$2253$ph$i>>>0);
     $or$cond10$i = $551 & $or$cond7$i;
     if (!($or$cond10$i)) {
      $561 = ($$2247$ph$i|0)==((-1)|0);
      if ($561) {
       $$2234243136$i = 0;
       break;
      } else {
       $$723947$i = $$2253$ph$i;$$748$i = $$2247$ph$i;
       label = 135;
       break L167;
      }
     }
     $552 = HEAP32[(12200)>>2]|0;
     $553 = (($491) - ($$2253$ph$i))|0;
     $554 = (($553) + ($552))|0;
     $555 = (0 - ($552))|0;
     $556 = $554 & $555;
     $557 = ($556>>>0)<(2147483647);
     if (!($557)) {
      $$723947$i = $$2253$ph$i;$$748$i = $$2247$ph$i;
      label = 135;
      break L167;
     }
     $558 = (_sbrk(($556|0))|0);
     $559 = ($558|0)==((-1)|0);
     if ($559) {
      (_sbrk(($548|0))|0);
      $$2234243136$i = 0;
      break;
     } else {
      $560 = (($556) + ($$2253$ph$i))|0;
      $$723947$i = $560;$$748$i = $$2247$ph$i;
      label = 135;
      break L167;
     }
    }
   } while(0);
   $562 = HEAP32[(12164)>>2]|0;
   $563 = $562 | 4;
   HEAP32[(12164)>>2] = $563;
   $$4236$i = $$2234243136$i;
   label = 133;
  } else {
   $$4236$i = 0;
   label = 133;
  }
 } while(0);
 if ((label|0) == 133) {
  $564 = ($495>>>0)<(2147483647);
  if ($564) {
   $565 = (_sbrk(($495|0))|0);
   $566 = (_sbrk(0)|0);
   $567 = ($565|0)!=((-1)|0);
   $568 = ($566|0)!=((-1)|0);
   $or$cond5$i = $567 & $568;
   $569 = ($565>>>0)<($566>>>0);
   $or$cond11$i = $569 & $or$cond5$i;
   $570 = $566;
   $571 = $565;
   $572 = (($570) - ($571))|0;
   $573 = (($$0192) + 40)|0;
   $574 = ($572>>>0)>($573>>>0);
   $$$4236$i = $574 ? $572 : $$4236$i;
   $or$cond11$not$i = $or$cond11$i ^ 1;
   $575 = ($565|0)==((-1)|0);
   $not$$i197 = $574 ^ 1;
   $576 = $575 | $not$$i197;
   $or$cond49$i = $576 | $or$cond11$not$i;
   if (!($or$cond49$i)) {
    $$723947$i = $$$4236$i;$$748$i = $565;
    label = 135;
   }
  }
 }
 if ((label|0) == 135) {
  $577 = HEAP32[(12152)>>2]|0;
  $578 = (($577) + ($$723947$i))|0;
  HEAP32[(12152)>>2] = $578;
  $579 = HEAP32[(12156)>>2]|0;
  $580 = ($578>>>0)>($579>>>0);
  if ($580) {
   HEAP32[(12156)>>2] = $578;
  }
  $581 = HEAP32[(11744)>>2]|0;
  $582 = ($581|0)==(0|0);
  do {
   if ($582) {
    $583 = HEAP32[(11736)>>2]|0;
    $584 = ($583|0)==(0|0);
    $585 = ($$748$i>>>0)<($583>>>0);
    $or$cond12$i = $584 | $585;
    if ($or$cond12$i) {
     HEAP32[(11736)>>2] = $$748$i;
    }
    HEAP32[(12168)>>2] = $$748$i;
    HEAP32[(12172)>>2] = $$723947$i;
    HEAP32[(12180)>>2] = 0;
    $586 = HEAP32[3048]|0;
    HEAP32[(11756)>>2] = $586;
    HEAP32[(11752)>>2] = -1;
    $$01$i$i = 0;
    while(1) {
     $587 = $$01$i$i << 1;
     $588 = (11760 + ($587<<2)|0);
     $589 = ((($588)) + 12|0);
     HEAP32[$589>>2] = $588;
     $590 = ((($588)) + 8|0);
     HEAP32[$590>>2] = $588;
     $591 = (($$01$i$i) + 1)|0;
     $exitcond$i$i = ($591|0)==(32);
     if ($exitcond$i$i) {
      break;
     } else {
      $$01$i$i = $591;
     }
    }
    $592 = (($$723947$i) + -40)|0;
    $593 = ((($$748$i)) + 8|0);
    $594 = $593;
    $595 = $594 & 7;
    $596 = ($595|0)==(0);
    $597 = (0 - ($594))|0;
    $598 = $597 & 7;
    $599 = $596 ? 0 : $598;
    $600 = (($$748$i) + ($599)|0);
    $601 = (($592) - ($599))|0;
    HEAP32[(11744)>>2] = $600;
    HEAP32[(11732)>>2] = $601;
    $602 = $601 | 1;
    $603 = ((($600)) + 4|0);
    HEAP32[$603>>2] = $602;
    $604 = (($600) + ($601)|0);
    $605 = ((($604)) + 4|0);
    HEAP32[$605>>2] = 40;
    $606 = HEAP32[(12208)>>2]|0;
    HEAP32[(11748)>>2] = $606;
   } else {
    $$024370$i = (12168);
    while(1) {
     $607 = HEAP32[$$024370$i>>2]|0;
     $608 = ((($$024370$i)) + 4|0);
     $609 = HEAP32[$608>>2]|0;
     $610 = (($607) + ($609)|0);
     $611 = ($$748$i|0)==($610|0);
     if ($611) {
      label = 145;
      break;
     }
     $612 = ((($$024370$i)) + 8|0);
     $613 = HEAP32[$612>>2]|0;
     $614 = ($613|0)==(0|0);
     if ($614) {
      break;
     } else {
      $$024370$i = $613;
     }
    }
    if ((label|0) == 145) {
     $615 = ((($$024370$i)) + 12|0);
     $616 = HEAP32[$615>>2]|0;
     $617 = $616 & 8;
     $618 = ($617|0)==(0);
     if ($618) {
      $619 = ($581>>>0)>=($607>>>0);
      $620 = ($581>>>0)<($$748$i>>>0);
      $or$cond50$i = $620 & $619;
      if ($or$cond50$i) {
       $621 = (($609) + ($$723947$i))|0;
       HEAP32[$608>>2] = $621;
       $622 = HEAP32[(11732)>>2]|0;
       $623 = ((($581)) + 8|0);
       $624 = $623;
       $625 = $624 & 7;
       $626 = ($625|0)==(0);
       $627 = (0 - ($624))|0;
       $628 = $627 & 7;
       $629 = $626 ? 0 : $628;
       $630 = (($581) + ($629)|0);
       $631 = (($$723947$i) - ($629))|0;
       $632 = (($622) + ($631))|0;
       HEAP32[(11744)>>2] = $630;
       HEAP32[(11732)>>2] = $632;
       $633 = $632 | 1;
       $634 = ((($630)) + 4|0);
       HEAP32[$634>>2] = $633;
       $635 = (($630) + ($632)|0);
       $636 = ((($635)) + 4|0);
       HEAP32[$636>>2] = 40;
       $637 = HEAP32[(12208)>>2]|0;
       HEAP32[(11748)>>2] = $637;
       break;
      }
     }
    }
    $638 = HEAP32[(11736)>>2]|0;
    $639 = ($$748$i>>>0)<($638>>>0);
    if ($639) {
     HEAP32[(11736)>>2] = $$748$i;
    }
    $640 = (($$748$i) + ($$723947$i)|0);
    $$124469$i = (12168);
    while(1) {
     $641 = HEAP32[$$124469$i>>2]|0;
     $642 = ($641|0)==($640|0);
     if ($642) {
      label = 153;
      break;
     }
     $643 = ((($$124469$i)) + 8|0);
     $644 = HEAP32[$643>>2]|0;
     $645 = ($644|0)==(0|0);
     if ($645) {
      break;
     } else {
      $$124469$i = $644;
     }
    }
    if ((label|0) == 153) {
     $646 = ((($$124469$i)) + 12|0);
     $647 = HEAP32[$646>>2]|0;
     $648 = $647 & 8;
     $649 = ($648|0)==(0);
     if ($649) {
      HEAP32[$$124469$i>>2] = $$748$i;
      $650 = ((($$124469$i)) + 4|0);
      $651 = HEAP32[$650>>2]|0;
      $652 = (($651) + ($$723947$i))|0;
      HEAP32[$650>>2] = $652;
      $653 = ((($$748$i)) + 8|0);
      $654 = $653;
      $655 = $654 & 7;
      $656 = ($655|0)==(0);
      $657 = (0 - ($654))|0;
      $658 = $657 & 7;
      $659 = $656 ? 0 : $658;
      $660 = (($$748$i) + ($659)|0);
      $661 = ((($640)) + 8|0);
      $662 = $661;
      $663 = $662 & 7;
      $664 = ($663|0)==(0);
      $665 = (0 - ($662))|0;
      $666 = $665 & 7;
      $667 = $664 ? 0 : $666;
      $668 = (($640) + ($667)|0);
      $669 = $668;
      $670 = $660;
      $671 = (($669) - ($670))|0;
      $672 = (($660) + ($$0192)|0);
      $673 = (($671) - ($$0192))|0;
      $674 = $$0192 | 3;
      $675 = ((($660)) + 4|0);
      HEAP32[$675>>2] = $674;
      $676 = ($668|0)==($581|0);
      do {
       if ($676) {
        $677 = HEAP32[(11732)>>2]|0;
        $678 = (($677) + ($673))|0;
        HEAP32[(11732)>>2] = $678;
        HEAP32[(11744)>>2] = $672;
        $679 = $678 | 1;
        $680 = ((($672)) + 4|0);
        HEAP32[$680>>2] = $679;
       } else {
        $681 = HEAP32[(11740)>>2]|0;
        $682 = ($668|0)==($681|0);
        if ($682) {
         $683 = HEAP32[(11728)>>2]|0;
         $684 = (($683) + ($673))|0;
         HEAP32[(11728)>>2] = $684;
         HEAP32[(11740)>>2] = $672;
         $685 = $684 | 1;
         $686 = ((($672)) + 4|0);
         HEAP32[$686>>2] = $685;
         $687 = (($672) + ($684)|0);
         HEAP32[$687>>2] = $684;
         break;
        }
        $688 = ((($668)) + 4|0);
        $689 = HEAP32[$688>>2]|0;
        $690 = $689 & 3;
        $691 = ($690|0)==(1);
        if ($691) {
         $692 = $689 & -8;
         $693 = $689 >>> 3;
         $694 = ($689>>>0)<(256);
         L237: do {
          if ($694) {
           $695 = ((($668)) + 8|0);
           $696 = HEAP32[$695>>2]|0;
           $697 = ((($668)) + 12|0);
           $698 = HEAP32[$697>>2]|0;
           $699 = ($698|0)==($696|0);
           if ($699) {
            $700 = 1 << $693;
            $701 = $700 ^ -1;
            $702 = HEAP32[2930]|0;
            $703 = $702 & $701;
            HEAP32[2930] = $703;
            break;
           } else {
            $704 = ((($696)) + 12|0);
            HEAP32[$704>>2] = $698;
            $705 = ((($698)) + 8|0);
            HEAP32[$705>>2] = $696;
            break;
           }
          } else {
           $706 = ((($668)) + 24|0);
           $707 = HEAP32[$706>>2]|0;
           $708 = ((($668)) + 12|0);
           $709 = HEAP32[$708>>2]|0;
           $710 = ($709|0)==($668|0);
           do {
            if ($710) {
             $715 = ((($668)) + 16|0);
             $716 = ((($715)) + 4|0);
             $717 = HEAP32[$716>>2]|0;
             $718 = ($717|0)==(0|0);
             if ($718) {
              $719 = HEAP32[$715>>2]|0;
              $720 = ($719|0)==(0|0);
              if ($720) {
               $$3$i$i = 0;
               break;
              } else {
               $$1264$i$i = $719;$$1266$i$i = $715;
              }
             } else {
              $$1264$i$i = $717;$$1266$i$i = $716;
             }
             while(1) {
              $721 = ((($$1264$i$i)) + 20|0);
              $722 = HEAP32[$721>>2]|0;
              $723 = ($722|0)==(0|0);
              if (!($723)) {
               $$1264$i$i = $722;$$1266$i$i = $721;
               continue;
              }
              $724 = ((($$1264$i$i)) + 16|0);
              $725 = HEAP32[$724>>2]|0;
              $726 = ($725|0)==(0|0);
              if ($726) {
               break;
              } else {
               $$1264$i$i = $725;$$1266$i$i = $724;
              }
             }
             HEAP32[$$1266$i$i>>2] = 0;
             $$3$i$i = $$1264$i$i;
            } else {
             $711 = ((($668)) + 8|0);
             $712 = HEAP32[$711>>2]|0;
             $713 = ((($712)) + 12|0);
             HEAP32[$713>>2] = $709;
             $714 = ((($709)) + 8|0);
             HEAP32[$714>>2] = $712;
             $$3$i$i = $709;
            }
           } while(0);
           $727 = ($707|0)==(0|0);
           if ($727) {
            break;
           }
           $728 = ((($668)) + 28|0);
           $729 = HEAP32[$728>>2]|0;
           $730 = (12024 + ($729<<2)|0);
           $731 = HEAP32[$730>>2]|0;
           $732 = ($668|0)==($731|0);
           do {
            if ($732) {
             HEAP32[$730>>2] = $$3$i$i;
             $cond$i$i = ($$3$i$i|0)==(0|0);
             if (!($cond$i$i)) {
              break;
             }
             $733 = 1 << $729;
             $734 = $733 ^ -1;
             $735 = HEAP32[(11724)>>2]|0;
             $736 = $735 & $734;
             HEAP32[(11724)>>2] = $736;
             break L237;
            } else {
             $737 = ((($707)) + 16|0);
             $738 = HEAP32[$737>>2]|0;
             $not$$i$i = ($738|0)!=($668|0);
             $$sink1$i$i = $not$$i$i&1;
             $739 = (((($707)) + 16|0) + ($$sink1$i$i<<2)|0);
             HEAP32[$739>>2] = $$3$i$i;
             $740 = ($$3$i$i|0)==(0|0);
             if ($740) {
              break L237;
             }
            }
           } while(0);
           $741 = ((($$3$i$i)) + 24|0);
           HEAP32[$741>>2] = $707;
           $742 = ((($668)) + 16|0);
           $743 = HEAP32[$742>>2]|0;
           $744 = ($743|0)==(0|0);
           if (!($744)) {
            $745 = ((($$3$i$i)) + 16|0);
            HEAP32[$745>>2] = $743;
            $746 = ((($743)) + 24|0);
            HEAP32[$746>>2] = $$3$i$i;
           }
           $747 = ((($742)) + 4|0);
           $748 = HEAP32[$747>>2]|0;
           $749 = ($748|0)==(0|0);
           if ($749) {
            break;
           }
           $750 = ((($$3$i$i)) + 20|0);
           HEAP32[$750>>2] = $748;
           $751 = ((($748)) + 24|0);
           HEAP32[$751>>2] = $$3$i$i;
          }
         } while(0);
         $752 = (($668) + ($692)|0);
         $753 = (($692) + ($673))|0;
         $$0$i$i = $752;$$0260$i$i = $753;
        } else {
         $$0$i$i = $668;$$0260$i$i = $673;
        }
        $754 = ((($$0$i$i)) + 4|0);
        $755 = HEAP32[$754>>2]|0;
        $756 = $755 & -2;
        HEAP32[$754>>2] = $756;
        $757 = $$0260$i$i | 1;
        $758 = ((($672)) + 4|0);
        HEAP32[$758>>2] = $757;
        $759 = (($672) + ($$0260$i$i)|0);
        HEAP32[$759>>2] = $$0260$i$i;
        $760 = $$0260$i$i >>> 3;
        $761 = ($$0260$i$i>>>0)<(256);
        if ($761) {
         $762 = $760 << 1;
         $763 = (11760 + ($762<<2)|0);
         $764 = HEAP32[2930]|0;
         $765 = 1 << $760;
         $766 = $764 & $765;
         $767 = ($766|0)==(0);
         if ($767) {
          $768 = $764 | $765;
          HEAP32[2930] = $768;
          $$pre$i17$i = ((($763)) + 8|0);
          $$0268$i$i = $763;$$pre$phi$i18$iZ2D = $$pre$i17$i;
         } else {
          $769 = ((($763)) + 8|0);
          $770 = HEAP32[$769>>2]|0;
          $$0268$i$i = $770;$$pre$phi$i18$iZ2D = $769;
         }
         HEAP32[$$pre$phi$i18$iZ2D>>2] = $672;
         $771 = ((($$0268$i$i)) + 12|0);
         HEAP32[$771>>2] = $672;
         $772 = ((($672)) + 8|0);
         HEAP32[$772>>2] = $$0268$i$i;
         $773 = ((($672)) + 12|0);
         HEAP32[$773>>2] = $763;
         break;
        }
        $774 = $$0260$i$i >>> 8;
        $775 = ($774|0)==(0);
        do {
         if ($775) {
          $$0269$i$i = 0;
         } else {
          $776 = ($$0260$i$i>>>0)>(16777215);
          if ($776) {
           $$0269$i$i = 31;
           break;
          }
          $777 = (($774) + 1048320)|0;
          $778 = $777 >>> 16;
          $779 = $778 & 8;
          $780 = $774 << $779;
          $781 = (($780) + 520192)|0;
          $782 = $781 >>> 16;
          $783 = $782 & 4;
          $784 = $783 | $779;
          $785 = $780 << $783;
          $786 = (($785) + 245760)|0;
          $787 = $786 >>> 16;
          $788 = $787 & 2;
          $789 = $784 | $788;
          $790 = (14 - ($789))|0;
          $791 = $785 << $788;
          $792 = $791 >>> 15;
          $793 = (($790) + ($792))|0;
          $794 = $793 << 1;
          $795 = (($793) + 7)|0;
          $796 = $$0260$i$i >>> $795;
          $797 = $796 & 1;
          $798 = $797 | $794;
          $$0269$i$i = $798;
         }
        } while(0);
        $799 = (12024 + ($$0269$i$i<<2)|0);
        $800 = ((($672)) + 28|0);
        HEAP32[$800>>2] = $$0269$i$i;
        $801 = ((($672)) + 16|0);
        $802 = ((($801)) + 4|0);
        HEAP32[$802>>2] = 0;
        HEAP32[$801>>2] = 0;
        $803 = HEAP32[(11724)>>2]|0;
        $804 = 1 << $$0269$i$i;
        $805 = $803 & $804;
        $806 = ($805|0)==(0);
        if ($806) {
         $807 = $803 | $804;
         HEAP32[(11724)>>2] = $807;
         HEAP32[$799>>2] = $672;
         $808 = ((($672)) + 24|0);
         HEAP32[$808>>2] = $799;
         $809 = ((($672)) + 12|0);
         HEAP32[$809>>2] = $672;
         $810 = ((($672)) + 8|0);
         HEAP32[$810>>2] = $672;
         break;
        }
        $811 = HEAP32[$799>>2]|0;
        $812 = ($$0269$i$i|0)==(31);
        $813 = $$0269$i$i >>> 1;
        $814 = (25 - ($813))|0;
        $815 = $812 ? 0 : $814;
        $816 = $$0260$i$i << $815;
        $$0261$i$i = $816;$$0262$i$i = $811;
        while(1) {
         $817 = ((($$0262$i$i)) + 4|0);
         $818 = HEAP32[$817>>2]|0;
         $819 = $818 & -8;
         $820 = ($819|0)==($$0260$i$i|0);
         if ($820) {
          label = 194;
          break;
         }
         $821 = $$0261$i$i >>> 31;
         $822 = (((($$0262$i$i)) + 16|0) + ($821<<2)|0);
         $823 = $$0261$i$i << 1;
         $824 = HEAP32[$822>>2]|0;
         $825 = ($824|0)==(0|0);
         if ($825) {
          label = 193;
          break;
         } else {
          $$0261$i$i = $823;$$0262$i$i = $824;
         }
        }
        if ((label|0) == 193) {
         HEAP32[$822>>2] = $672;
         $826 = ((($672)) + 24|0);
         HEAP32[$826>>2] = $$0262$i$i;
         $827 = ((($672)) + 12|0);
         HEAP32[$827>>2] = $672;
         $828 = ((($672)) + 8|0);
         HEAP32[$828>>2] = $672;
         break;
        }
        else if ((label|0) == 194) {
         $829 = ((($$0262$i$i)) + 8|0);
         $830 = HEAP32[$829>>2]|0;
         $831 = ((($830)) + 12|0);
         HEAP32[$831>>2] = $672;
         HEAP32[$829>>2] = $672;
         $832 = ((($672)) + 8|0);
         HEAP32[$832>>2] = $830;
         $833 = ((($672)) + 12|0);
         HEAP32[$833>>2] = $$0262$i$i;
         $834 = ((($672)) + 24|0);
         HEAP32[$834>>2] = 0;
         break;
        }
       }
      } while(0);
      $959 = ((($660)) + 8|0);
      $$0 = $959;
      STACKTOP = sp;return ($$0|0);
     }
    }
    $$0$i$i$i = (12168);
    while(1) {
     $835 = HEAP32[$$0$i$i$i>>2]|0;
     $836 = ($835>>>0)>($581>>>0);
     if (!($836)) {
      $837 = ((($$0$i$i$i)) + 4|0);
      $838 = HEAP32[$837>>2]|0;
      $839 = (($835) + ($838)|0);
      $840 = ($839>>>0)>($581>>>0);
      if ($840) {
       break;
      }
     }
     $841 = ((($$0$i$i$i)) + 8|0);
     $842 = HEAP32[$841>>2]|0;
     $$0$i$i$i = $842;
    }
    $843 = ((($839)) + -47|0);
    $844 = ((($843)) + 8|0);
    $845 = $844;
    $846 = $845 & 7;
    $847 = ($846|0)==(0);
    $848 = (0 - ($845))|0;
    $849 = $848 & 7;
    $850 = $847 ? 0 : $849;
    $851 = (($843) + ($850)|0);
    $852 = ((($581)) + 16|0);
    $853 = ($851>>>0)<($852>>>0);
    $854 = $853 ? $581 : $851;
    $855 = ((($854)) + 8|0);
    $856 = ((($854)) + 24|0);
    $857 = (($$723947$i) + -40)|0;
    $858 = ((($$748$i)) + 8|0);
    $859 = $858;
    $860 = $859 & 7;
    $861 = ($860|0)==(0);
    $862 = (0 - ($859))|0;
    $863 = $862 & 7;
    $864 = $861 ? 0 : $863;
    $865 = (($$748$i) + ($864)|0);
    $866 = (($857) - ($864))|0;
    HEAP32[(11744)>>2] = $865;
    HEAP32[(11732)>>2] = $866;
    $867 = $866 | 1;
    $868 = ((($865)) + 4|0);
    HEAP32[$868>>2] = $867;
    $869 = (($865) + ($866)|0);
    $870 = ((($869)) + 4|0);
    HEAP32[$870>>2] = 40;
    $871 = HEAP32[(12208)>>2]|0;
    HEAP32[(11748)>>2] = $871;
    $872 = ((($854)) + 4|0);
    HEAP32[$872>>2] = 27;
    ;HEAP32[$855>>2]=HEAP32[(12168)>>2]|0;HEAP32[$855+4>>2]=HEAP32[(12168)+4>>2]|0;HEAP32[$855+8>>2]=HEAP32[(12168)+8>>2]|0;HEAP32[$855+12>>2]=HEAP32[(12168)+12>>2]|0;
    HEAP32[(12168)>>2] = $$748$i;
    HEAP32[(12172)>>2] = $$723947$i;
    HEAP32[(12180)>>2] = 0;
    HEAP32[(12176)>>2] = $855;
    $874 = $856;
    while(1) {
     $873 = ((($874)) + 4|0);
     HEAP32[$873>>2] = 7;
     $875 = ((($874)) + 8|0);
     $876 = ($875>>>0)<($839>>>0);
     if ($876) {
      $874 = $873;
     } else {
      break;
     }
    }
    $877 = ($854|0)==($581|0);
    if (!($877)) {
     $878 = $854;
     $879 = $581;
     $880 = (($878) - ($879))|0;
     $881 = HEAP32[$872>>2]|0;
     $882 = $881 & -2;
     HEAP32[$872>>2] = $882;
     $883 = $880 | 1;
     $884 = ((($581)) + 4|0);
     HEAP32[$884>>2] = $883;
     HEAP32[$854>>2] = $880;
     $885 = $880 >>> 3;
     $886 = ($880>>>0)<(256);
     if ($886) {
      $887 = $885 << 1;
      $888 = (11760 + ($887<<2)|0);
      $889 = HEAP32[2930]|0;
      $890 = 1 << $885;
      $891 = $889 & $890;
      $892 = ($891|0)==(0);
      if ($892) {
       $893 = $889 | $890;
       HEAP32[2930] = $893;
       $$pre$i$i = ((($888)) + 8|0);
       $$0206$i$i = $888;$$pre$phi$i$iZ2D = $$pre$i$i;
      } else {
       $894 = ((($888)) + 8|0);
       $895 = HEAP32[$894>>2]|0;
       $$0206$i$i = $895;$$pre$phi$i$iZ2D = $894;
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $581;
      $896 = ((($$0206$i$i)) + 12|0);
      HEAP32[$896>>2] = $581;
      $897 = ((($581)) + 8|0);
      HEAP32[$897>>2] = $$0206$i$i;
      $898 = ((($581)) + 12|0);
      HEAP32[$898>>2] = $888;
      break;
     }
     $899 = $880 >>> 8;
     $900 = ($899|0)==(0);
     if ($900) {
      $$0207$i$i = 0;
     } else {
      $901 = ($880>>>0)>(16777215);
      if ($901) {
       $$0207$i$i = 31;
      } else {
       $902 = (($899) + 1048320)|0;
       $903 = $902 >>> 16;
       $904 = $903 & 8;
       $905 = $899 << $904;
       $906 = (($905) + 520192)|0;
       $907 = $906 >>> 16;
       $908 = $907 & 4;
       $909 = $908 | $904;
       $910 = $905 << $908;
       $911 = (($910) + 245760)|0;
       $912 = $911 >>> 16;
       $913 = $912 & 2;
       $914 = $909 | $913;
       $915 = (14 - ($914))|0;
       $916 = $910 << $913;
       $917 = $916 >>> 15;
       $918 = (($915) + ($917))|0;
       $919 = $918 << 1;
       $920 = (($918) + 7)|0;
       $921 = $880 >>> $920;
       $922 = $921 & 1;
       $923 = $922 | $919;
       $$0207$i$i = $923;
      }
     }
     $924 = (12024 + ($$0207$i$i<<2)|0);
     $925 = ((($581)) + 28|0);
     HEAP32[$925>>2] = $$0207$i$i;
     $926 = ((($581)) + 20|0);
     HEAP32[$926>>2] = 0;
     HEAP32[$852>>2] = 0;
     $927 = HEAP32[(11724)>>2]|0;
     $928 = 1 << $$0207$i$i;
     $929 = $927 & $928;
     $930 = ($929|0)==(0);
     if ($930) {
      $931 = $927 | $928;
      HEAP32[(11724)>>2] = $931;
      HEAP32[$924>>2] = $581;
      $932 = ((($581)) + 24|0);
      HEAP32[$932>>2] = $924;
      $933 = ((($581)) + 12|0);
      HEAP32[$933>>2] = $581;
      $934 = ((($581)) + 8|0);
      HEAP32[$934>>2] = $581;
      break;
     }
     $935 = HEAP32[$924>>2]|0;
     $936 = ($$0207$i$i|0)==(31);
     $937 = $$0207$i$i >>> 1;
     $938 = (25 - ($937))|0;
     $939 = $936 ? 0 : $938;
     $940 = $880 << $939;
     $$0201$i$i = $940;$$0202$i$i = $935;
     while(1) {
      $941 = ((($$0202$i$i)) + 4|0);
      $942 = HEAP32[$941>>2]|0;
      $943 = $942 & -8;
      $944 = ($943|0)==($880|0);
      if ($944) {
       label = 216;
       break;
      }
      $945 = $$0201$i$i >>> 31;
      $946 = (((($$0202$i$i)) + 16|0) + ($945<<2)|0);
      $947 = $$0201$i$i << 1;
      $948 = HEAP32[$946>>2]|0;
      $949 = ($948|0)==(0|0);
      if ($949) {
       label = 215;
       break;
      } else {
       $$0201$i$i = $947;$$0202$i$i = $948;
      }
     }
     if ((label|0) == 215) {
      HEAP32[$946>>2] = $581;
      $950 = ((($581)) + 24|0);
      HEAP32[$950>>2] = $$0202$i$i;
      $951 = ((($581)) + 12|0);
      HEAP32[$951>>2] = $581;
      $952 = ((($581)) + 8|0);
      HEAP32[$952>>2] = $581;
      break;
     }
     else if ((label|0) == 216) {
      $953 = ((($$0202$i$i)) + 8|0);
      $954 = HEAP32[$953>>2]|0;
      $955 = ((($954)) + 12|0);
      HEAP32[$955>>2] = $581;
      HEAP32[$953>>2] = $581;
      $956 = ((($581)) + 8|0);
      HEAP32[$956>>2] = $954;
      $957 = ((($581)) + 12|0);
      HEAP32[$957>>2] = $$0202$i$i;
      $958 = ((($581)) + 24|0);
      HEAP32[$958>>2] = 0;
      break;
     }
    }
   }
  } while(0);
  $960 = HEAP32[(11732)>>2]|0;
  $961 = ($960>>>0)>($$0192>>>0);
  if ($961) {
   $962 = (($960) - ($$0192))|0;
   HEAP32[(11732)>>2] = $962;
   $963 = HEAP32[(11744)>>2]|0;
   $964 = (($963) + ($$0192)|0);
   HEAP32[(11744)>>2] = $964;
   $965 = $962 | 1;
   $966 = ((($964)) + 4|0);
   HEAP32[$966>>2] = $965;
   $967 = $$0192 | 3;
   $968 = ((($963)) + 4|0);
   HEAP32[$968>>2] = $967;
   $969 = ((($963)) + 8|0);
   $$0 = $969;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $970 = (___errno_location()|0);
 HEAP32[$970>>2] = 12;
 $$0 = 0;
 STACKTOP = sp;return ($$0|0);
}
function _free($0) {
 $0 = $0|0;
 var $$0195$i = 0, $$0195$in$i = 0, $$0348 = 0, $$0349 = 0, $$0361 = 0, $$0368 = 0, $$1 = 0, $$1347 = 0, $$1352 = 0, $$1355 = 0, $$1363 = 0, $$1367 = 0, $$2 = 0, $$3 = 0, $$3365 = 0, $$pre = 0, $$pre$phiZ2D = 0, $$sink3 = 0, $$sink5 = 0, $1 = 0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0;
 var $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0;
 var $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0;
 var $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $cond374 = 0, $cond375 = 0, $not$ = 0, $not$370 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  return;
 }
 $2 = ((($0)) + -8|0);
 $3 = HEAP32[(11736)>>2]|0;
 $4 = ((($0)) + -4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $5 & -8;
 $7 = (($2) + ($6)|0);
 $8 = $5 & 1;
 $9 = ($8|0)==(0);
 do {
  if ($9) {
   $10 = HEAP32[$2>>2]|0;
   $11 = $5 & 3;
   $12 = ($11|0)==(0);
   if ($12) {
    return;
   }
   $13 = (0 - ($10))|0;
   $14 = (($2) + ($13)|0);
   $15 = (($10) + ($6))|0;
   $16 = ($14>>>0)<($3>>>0);
   if ($16) {
    return;
   }
   $17 = HEAP32[(11740)>>2]|0;
   $18 = ($14|0)==($17|0);
   if ($18) {
    $78 = ((($7)) + 4|0);
    $79 = HEAP32[$78>>2]|0;
    $80 = $79 & 3;
    $81 = ($80|0)==(3);
    if (!($81)) {
     $$1 = $14;$$1347 = $15;$87 = $14;
     break;
    }
    $82 = (($14) + ($15)|0);
    $83 = ((($14)) + 4|0);
    $84 = $15 | 1;
    $85 = $79 & -2;
    HEAP32[(11728)>>2] = $15;
    HEAP32[$78>>2] = $85;
    HEAP32[$83>>2] = $84;
    HEAP32[$82>>2] = $15;
    return;
   }
   $19 = $10 >>> 3;
   $20 = ($10>>>0)<(256);
   if ($20) {
    $21 = ((($14)) + 8|0);
    $22 = HEAP32[$21>>2]|0;
    $23 = ((($14)) + 12|0);
    $24 = HEAP32[$23>>2]|0;
    $25 = ($24|0)==($22|0);
    if ($25) {
     $26 = 1 << $19;
     $27 = $26 ^ -1;
     $28 = HEAP32[2930]|0;
     $29 = $28 & $27;
     HEAP32[2930] = $29;
     $$1 = $14;$$1347 = $15;$87 = $14;
     break;
    } else {
     $30 = ((($22)) + 12|0);
     HEAP32[$30>>2] = $24;
     $31 = ((($24)) + 8|0);
     HEAP32[$31>>2] = $22;
     $$1 = $14;$$1347 = $15;$87 = $14;
     break;
    }
   }
   $32 = ((($14)) + 24|0);
   $33 = HEAP32[$32>>2]|0;
   $34 = ((($14)) + 12|0);
   $35 = HEAP32[$34>>2]|0;
   $36 = ($35|0)==($14|0);
   do {
    if ($36) {
     $41 = ((($14)) + 16|0);
     $42 = ((($41)) + 4|0);
     $43 = HEAP32[$42>>2]|0;
     $44 = ($43|0)==(0|0);
     if ($44) {
      $45 = HEAP32[$41>>2]|0;
      $46 = ($45|0)==(0|0);
      if ($46) {
       $$3 = 0;
       break;
      } else {
       $$1352 = $45;$$1355 = $41;
      }
     } else {
      $$1352 = $43;$$1355 = $42;
     }
     while(1) {
      $47 = ((($$1352)) + 20|0);
      $48 = HEAP32[$47>>2]|0;
      $49 = ($48|0)==(0|0);
      if (!($49)) {
       $$1352 = $48;$$1355 = $47;
       continue;
      }
      $50 = ((($$1352)) + 16|0);
      $51 = HEAP32[$50>>2]|0;
      $52 = ($51|0)==(0|0);
      if ($52) {
       break;
      } else {
       $$1352 = $51;$$1355 = $50;
      }
     }
     HEAP32[$$1355>>2] = 0;
     $$3 = $$1352;
    } else {
     $37 = ((($14)) + 8|0);
     $38 = HEAP32[$37>>2]|0;
     $39 = ((($38)) + 12|0);
     HEAP32[$39>>2] = $35;
     $40 = ((($35)) + 8|0);
     HEAP32[$40>>2] = $38;
     $$3 = $35;
    }
   } while(0);
   $53 = ($33|0)==(0|0);
   if ($53) {
    $$1 = $14;$$1347 = $15;$87 = $14;
   } else {
    $54 = ((($14)) + 28|0);
    $55 = HEAP32[$54>>2]|0;
    $56 = (12024 + ($55<<2)|0);
    $57 = HEAP32[$56>>2]|0;
    $58 = ($14|0)==($57|0);
    if ($58) {
     HEAP32[$56>>2] = $$3;
     $cond374 = ($$3|0)==(0|0);
     if ($cond374) {
      $59 = 1 << $55;
      $60 = $59 ^ -1;
      $61 = HEAP32[(11724)>>2]|0;
      $62 = $61 & $60;
      HEAP32[(11724)>>2] = $62;
      $$1 = $14;$$1347 = $15;$87 = $14;
      break;
     }
    } else {
     $63 = ((($33)) + 16|0);
     $64 = HEAP32[$63>>2]|0;
     $not$370 = ($64|0)!=($14|0);
     $$sink3 = $not$370&1;
     $65 = (((($33)) + 16|0) + ($$sink3<<2)|0);
     HEAP32[$65>>2] = $$3;
     $66 = ($$3|0)==(0|0);
     if ($66) {
      $$1 = $14;$$1347 = $15;$87 = $14;
      break;
     }
    }
    $67 = ((($$3)) + 24|0);
    HEAP32[$67>>2] = $33;
    $68 = ((($14)) + 16|0);
    $69 = HEAP32[$68>>2]|0;
    $70 = ($69|0)==(0|0);
    if (!($70)) {
     $71 = ((($$3)) + 16|0);
     HEAP32[$71>>2] = $69;
     $72 = ((($69)) + 24|0);
     HEAP32[$72>>2] = $$3;
    }
    $73 = ((($68)) + 4|0);
    $74 = HEAP32[$73>>2]|0;
    $75 = ($74|0)==(0|0);
    if ($75) {
     $$1 = $14;$$1347 = $15;$87 = $14;
    } else {
     $76 = ((($$3)) + 20|0);
     HEAP32[$76>>2] = $74;
     $77 = ((($74)) + 24|0);
     HEAP32[$77>>2] = $$3;
     $$1 = $14;$$1347 = $15;$87 = $14;
    }
   }
  } else {
   $$1 = $2;$$1347 = $6;$87 = $2;
  }
 } while(0);
 $86 = ($87>>>0)<($7>>>0);
 if (!($86)) {
  return;
 }
 $88 = ((($7)) + 4|0);
 $89 = HEAP32[$88>>2]|0;
 $90 = $89 & 1;
 $91 = ($90|0)==(0);
 if ($91) {
  return;
 }
 $92 = $89 & 2;
 $93 = ($92|0)==(0);
 if ($93) {
  $94 = HEAP32[(11744)>>2]|0;
  $95 = ($7|0)==($94|0);
  $96 = HEAP32[(11740)>>2]|0;
  if ($95) {
   $97 = HEAP32[(11732)>>2]|0;
   $98 = (($97) + ($$1347))|0;
   HEAP32[(11732)>>2] = $98;
   HEAP32[(11744)>>2] = $$1;
   $99 = $98 | 1;
   $100 = ((($$1)) + 4|0);
   HEAP32[$100>>2] = $99;
   $101 = ($$1|0)==($96|0);
   if (!($101)) {
    return;
   }
   HEAP32[(11740)>>2] = 0;
   HEAP32[(11728)>>2] = 0;
   return;
  }
  $102 = ($7|0)==($96|0);
  if ($102) {
   $103 = HEAP32[(11728)>>2]|0;
   $104 = (($103) + ($$1347))|0;
   HEAP32[(11728)>>2] = $104;
   HEAP32[(11740)>>2] = $87;
   $105 = $104 | 1;
   $106 = ((($$1)) + 4|0);
   HEAP32[$106>>2] = $105;
   $107 = (($87) + ($104)|0);
   HEAP32[$107>>2] = $104;
   return;
  }
  $108 = $89 & -8;
  $109 = (($108) + ($$1347))|0;
  $110 = $89 >>> 3;
  $111 = ($89>>>0)<(256);
  do {
   if ($111) {
    $112 = ((($7)) + 8|0);
    $113 = HEAP32[$112>>2]|0;
    $114 = ((($7)) + 12|0);
    $115 = HEAP32[$114>>2]|0;
    $116 = ($115|0)==($113|0);
    if ($116) {
     $117 = 1 << $110;
     $118 = $117 ^ -1;
     $119 = HEAP32[2930]|0;
     $120 = $119 & $118;
     HEAP32[2930] = $120;
     break;
    } else {
     $121 = ((($113)) + 12|0);
     HEAP32[$121>>2] = $115;
     $122 = ((($115)) + 8|0);
     HEAP32[$122>>2] = $113;
     break;
    }
   } else {
    $123 = ((($7)) + 24|0);
    $124 = HEAP32[$123>>2]|0;
    $125 = ((($7)) + 12|0);
    $126 = HEAP32[$125>>2]|0;
    $127 = ($126|0)==($7|0);
    do {
     if ($127) {
      $132 = ((($7)) + 16|0);
      $133 = ((($132)) + 4|0);
      $134 = HEAP32[$133>>2]|0;
      $135 = ($134|0)==(0|0);
      if ($135) {
       $136 = HEAP32[$132>>2]|0;
       $137 = ($136|0)==(0|0);
       if ($137) {
        $$3365 = 0;
        break;
       } else {
        $$1363 = $136;$$1367 = $132;
       }
      } else {
       $$1363 = $134;$$1367 = $133;
      }
      while(1) {
       $138 = ((($$1363)) + 20|0);
       $139 = HEAP32[$138>>2]|0;
       $140 = ($139|0)==(0|0);
       if (!($140)) {
        $$1363 = $139;$$1367 = $138;
        continue;
       }
       $141 = ((($$1363)) + 16|0);
       $142 = HEAP32[$141>>2]|0;
       $143 = ($142|0)==(0|0);
       if ($143) {
        break;
       } else {
        $$1363 = $142;$$1367 = $141;
       }
      }
      HEAP32[$$1367>>2] = 0;
      $$3365 = $$1363;
     } else {
      $128 = ((($7)) + 8|0);
      $129 = HEAP32[$128>>2]|0;
      $130 = ((($129)) + 12|0);
      HEAP32[$130>>2] = $126;
      $131 = ((($126)) + 8|0);
      HEAP32[$131>>2] = $129;
      $$3365 = $126;
     }
    } while(0);
    $144 = ($124|0)==(0|0);
    if (!($144)) {
     $145 = ((($7)) + 28|0);
     $146 = HEAP32[$145>>2]|0;
     $147 = (12024 + ($146<<2)|0);
     $148 = HEAP32[$147>>2]|0;
     $149 = ($7|0)==($148|0);
     if ($149) {
      HEAP32[$147>>2] = $$3365;
      $cond375 = ($$3365|0)==(0|0);
      if ($cond375) {
       $150 = 1 << $146;
       $151 = $150 ^ -1;
       $152 = HEAP32[(11724)>>2]|0;
       $153 = $152 & $151;
       HEAP32[(11724)>>2] = $153;
       break;
      }
     } else {
      $154 = ((($124)) + 16|0);
      $155 = HEAP32[$154>>2]|0;
      $not$ = ($155|0)!=($7|0);
      $$sink5 = $not$&1;
      $156 = (((($124)) + 16|0) + ($$sink5<<2)|0);
      HEAP32[$156>>2] = $$3365;
      $157 = ($$3365|0)==(0|0);
      if ($157) {
       break;
      }
     }
     $158 = ((($$3365)) + 24|0);
     HEAP32[$158>>2] = $124;
     $159 = ((($7)) + 16|0);
     $160 = HEAP32[$159>>2]|0;
     $161 = ($160|0)==(0|0);
     if (!($161)) {
      $162 = ((($$3365)) + 16|0);
      HEAP32[$162>>2] = $160;
      $163 = ((($160)) + 24|0);
      HEAP32[$163>>2] = $$3365;
     }
     $164 = ((($159)) + 4|0);
     $165 = HEAP32[$164>>2]|0;
     $166 = ($165|0)==(0|0);
     if (!($166)) {
      $167 = ((($$3365)) + 20|0);
      HEAP32[$167>>2] = $165;
      $168 = ((($165)) + 24|0);
      HEAP32[$168>>2] = $$3365;
     }
    }
   }
  } while(0);
  $169 = $109 | 1;
  $170 = ((($$1)) + 4|0);
  HEAP32[$170>>2] = $169;
  $171 = (($87) + ($109)|0);
  HEAP32[$171>>2] = $109;
  $172 = HEAP32[(11740)>>2]|0;
  $173 = ($$1|0)==($172|0);
  if ($173) {
   HEAP32[(11728)>>2] = $109;
   return;
  } else {
   $$2 = $109;
  }
 } else {
  $174 = $89 & -2;
  HEAP32[$88>>2] = $174;
  $175 = $$1347 | 1;
  $176 = ((($$1)) + 4|0);
  HEAP32[$176>>2] = $175;
  $177 = (($87) + ($$1347)|0);
  HEAP32[$177>>2] = $$1347;
  $$2 = $$1347;
 }
 $178 = $$2 >>> 3;
 $179 = ($$2>>>0)<(256);
 if ($179) {
  $180 = $178 << 1;
  $181 = (11760 + ($180<<2)|0);
  $182 = HEAP32[2930]|0;
  $183 = 1 << $178;
  $184 = $182 & $183;
  $185 = ($184|0)==(0);
  if ($185) {
   $186 = $182 | $183;
   HEAP32[2930] = $186;
   $$pre = ((($181)) + 8|0);
   $$0368 = $181;$$pre$phiZ2D = $$pre;
  } else {
   $187 = ((($181)) + 8|0);
   $188 = HEAP32[$187>>2]|0;
   $$0368 = $188;$$pre$phiZ2D = $187;
  }
  HEAP32[$$pre$phiZ2D>>2] = $$1;
  $189 = ((($$0368)) + 12|0);
  HEAP32[$189>>2] = $$1;
  $190 = ((($$1)) + 8|0);
  HEAP32[$190>>2] = $$0368;
  $191 = ((($$1)) + 12|0);
  HEAP32[$191>>2] = $181;
  return;
 }
 $192 = $$2 >>> 8;
 $193 = ($192|0)==(0);
 if ($193) {
  $$0361 = 0;
 } else {
  $194 = ($$2>>>0)>(16777215);
  if ($194) {
   $$0361 = 31;
  } else {
   $195 = (($192) + 1048320)|0;
   $196 = $195 >>> 16;
   $197 = $196 & 8;
   $198 = $192 << $197;
   $199 = (($198) + 520192)|0;
   $200 = $199 >>> 16;
   $201 = $200 & 4;
   $202 = $201 | $197;
   $203 = $198 << $201;
   $204 = (($203) + 245760)|0;
   $205 = $204 >>> 16;
   $206 = $205 & 2;
   $207 = $202 | $206;
   $208 = (14 - ($207))|0;
   $209 = $203 << $206;
   $210 = $209 >>> 15;
   $211 = (($208) + ($210))|0;
   $212 = $211 << 1;
   $213 = (($211) + 7)|0;
   $214 = $$2 >>> $213;
   $215 = $214 & 1;
   $216 = $215 | $212;
   $$0361 = $216;
  }
 }
 $217 = (12024 + ($$0361<<2)|0);
 $218 = ((($$1)) + 28|0);
 HEAP32[$218>>2] = $$0361;
 $219 = ((($$1)) + 16|0);
 $220 = ((($$1)) + 20|0);
 HEAP32[$220>>2] = 0;
 HEAP32[$219>>2] = 0;
 $221 = HEAP32[(11724)>>2]|0;
 $222 = 1 << $$0361;
 $223 = $221 & $222;
 $224 = ($223|0)==(0);
 do {
  if ($224) {
   $225 = $221 | $222;
   HEAP32[(11724)>>2] = $225;
   HEAP32[$217>>2] = $$1;
   $226 = ((($$1)) + 24|0);
   HEAP32[$226>>2] = $217;
   $227 = ((($$1)) + 12|0);
   HEAP32[$227>>2] = $$1;
   $228 = ((($$1)) + 8|0);
   HEAP32[$228>>2] = $$1;
  } else {
   $229 = HEAP32[$217>>2]|0;
   $230 = ($$0361|0)==(31);
   $231 = $$0361 >>> 1;
   $232 = (25 - ($231))|0;
   $233 = $230 ? 0 : $232;
   $234 = $$2 << $233;
   $$0348 = $234;$$0349 = $229;
   while(1) {
    $235 = ((($$0349)) + 4|0);
    $236 = HEAP32[$235>>2]|0;
    $237 = $236 & -8;
    $238 = ($237|0)==($$2|0);
    if ($238) {
     label = 73;
     break;
    }
    $239 = $$0348 >>> 31;
    $240 = (((($$0349)) + 16|0) + ($239<<2)|0);
    $241 = $$0348 << 1;
    $242 = HEAP32[$240>>2]|0;
    $243 = ($242|0)==(0|0);
    if ($243) {
     label = 72;
     break;
    } else {
     $$0348 = $241;$$0349 = $242;
    }
   }
   if ((label|0) == 72) {
    HEAP32[$240>>2] = $$1;
    $244 = ((($$1)) + 24|0);
    HEAP32[$244>>2] = $$0349;
    $245 = ((($$1)) + 12|0);
    HEAP32[$245>>2] = $$1;
    $246 = ((($$1)) + 8|0);
    HEAP32[$246>>2] = $$1;
    break;
   }
   else if ((label|0) == 73) {
    $247 = ((($$0349)) + 8|0);
    $248 = HEAP32[$247>>2]|0;
    $249 = ((($248)) + 12|0);
    HEAP32[$249>>2] = $$1;
    HEAP32[$247>>2] = $$1;
    $250 = ((($$1)) + 8|0);
    HEAP32[$250>>2] = $248;
    $251 = ((($$1)) + 12|0);
    HEAP32[$251>>2] = $$0349;
    $252 = ((($$1)) + 24|0);
    HEAP32[$252>>2] = 0;
    break;
   }
  }
 } while(0);
 $253 = HEAP32[(11752)>>2]|0;
 $254 = (($253) + -1)|0;
 HEAP32[(11752)>>2] = $254;
 $255 = ($254|0)==(0);
 if ($255) {
  $$0195$in$i = (12176);
 } else {
  return;
 }
 while(1) {
  $$0195$i = HEAP32[$$0195$in$i>>2]|0;
  $256 = ($$0195$i|0)==(0|0);
  $257 = ((($$0195$i)) + 8|0);
  if ($256) {
   break;
  } else {
   $$0195$in$i = $257;
  }
 }
 HEAP32[(11752)>>2] = -1;
 return;
}
function _realloc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0|0);
 if ($2) {
  $3 = (_malloc($1)|0);
  $$1 = $3;
  return ($$1|0);
 }
 $4 = ($1>>>0)>(4294967231);
 if ($4) {
  $5 = (___errno_location()|0);
  HEAP32[$5>>2] = 12;
  $$1 = 0;
  return ($$1|0);
 }
 $6 = ($1>>>0)<(11);
 $7 = (($1) + 11)|0;
 $8 = $7 & -8;
 $9 = $6 ? 16 : $8;
 $10 = ((($0)) + -8|0);
 $11 = (_try_realloc_chunk($10,$9)|0);
 $12 = ($11|0)==(0|0);
 if (!($12)) {
  $13 = ((($11)) + 8|0);
  $$1 = $13;
  return ($$1|0);
 }
 $14 = (_malloc($1)|0);
 $15 = ($14|0)==(0|0);
 if ($15) {
  $$1 = 0;
  return ($$1|0);
 }
 $16 = ((($0)) + -4|0);
 $17 = HEAP32[$16>>2]|0;
 $18 = $17 & -8;
 $19 = $17 & 3;
 $20 = ($19|0)==(0);
 $21 = $20 ? 8 : 4;
 $22 = (($18) - ($21))|0;
 $23 = ($22>>>0)<($1>>>0);
 $24 = $23 ? $22 : $1;
 _memcpy(($14|0),($0|0),($24|0))|0;
 _free($0);
 $$1 = $14;
 return ($$1|0);
}
function _try_realloc_chunk($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$1246 = 0, $$1249 = 0, $$2 = 0, $$3 = 0, $$sink1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0;
 var $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0;
 var $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $15 = 0, $16 = 0, $17 = 0;
 var $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0;
 var $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0;
 var $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0;
 var $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0;
 var $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $cond = 0, $not$ = 0, $storemerge = 0, $storemerge1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = $3 & -8;
 $5 = (($0) + ($4)|0);
 $6 = $3 & 3;
 $7 = ($6|0)==(0);
 if ($7) {
  $8 = ($1>>>0)<(256);
  if ($8) {
   $$2 = 0;
   return ($$2|0);
  }
  $9 = (($1) + 4)|0;
  $10 = ($4>>>0)<($9>>>0);
  if (!($10)) {
   $11 = (($4) - ($1))|0;
   $12 = HEAP32[(12200)>>2]|0;
   $13 = $12 << 1;
   $14 = ($11>>>0)>($13>>>0);
   if (!($14)) {
    $$2 = $0;
    return ($$2|0);
   }
  }
  $$2 = 0;
  return ($$2|0);
 }
 $15 = ($4>>>0)<($1>>>0);
 if (!($15)) {
  $16 = (($4) - ($1))|0;
  $17 = ($16>>>0)>(15);
  if (!($17)) {
   $$2 = $0;
   return ($$2|0);
  }
  $18 = (($0) + ($1)|0);
  $19 = $3 & 1;
  $20 = $19 | $1;
  $21 = $20 | 2;
  HEAP32[$2>>2] = $21;
  $22 = ((($18)) + 4|0);
  $23 = $16 | 3;
  HEAP32[$22>>2] = $23;
  $24 = (($18) + ($16)|0);
  $25 = ((($24)) + 4|0);
  $26 = HEAP32[$25>>2]|0;
  $27 = $26 | 1;
  HEAP32[$25>>2] = $27;
  _dispose_chunk($18,$16);
  $$2 = $0;
  return ($$2|0);
 }
 $28 = HEAP32[(11744)>>2]|0;
 $29 = ($5|0)==($28|0);
 if ($29) {
  $30 = HEAP32[(11732)>>2]|0;
  $31 = (($30) + ($4))|0;
  $32 = ($31>>>0)>($1>>>0);
  $33 = (($31) - ($1))|0;
  $34 = (($0) + ($1)|0);
  if (!($32)) {
   $$2 = 0;
   return ($$2|0);
  }
  $35 = $33 | 1;
  $36 = ((($34)) + 4|0);
  $37 = $3 & 1;
  $38 = $37 | $1;
  $39 = $38 | 2;
  HEAP32[$2>>2] = $39;
  HEAP32[$36>>2] = $35;
  HEAP32[(11744)>>2] = $34;
  HEAP32[(11732)>>2] = $33;
  $$2 = $0;
  return ($$2|0);
 }
 $40 = HEAP32[(11740)>>2]|0;
 $41 = ($5|0)==($40|0);
 if ($41) {
  $42 = HEAP32[(11728)>>2]|0;
  $43 = (($42) + ($4))|0;
  $44 = ($43>>>0)<($1>>>0);
  if ($44) {
   $$2 = 0;
   return ($$2|0);
  }
  $45 = (($43) - ($1))|0;
  $46 = ($45>>>0)>(15);
  $47 = $3 & 1;
  if ($46) {
   $48 = (($0) + ($1)|0);
   $49 = (($48) + ($45)|0);
   $50 = $47 | $1;
   $51 = $50 | 2;
   HEAP32[$2>>2] = $51;
   $52 = ((($48)) + 4|0);
   $53 = $45 | 1;
   HEAP32[$52>>2] = $53;
   HEAP32[$49>>2] = $45;
   $54 = ((($49)) + 4|0);
   $55 = HEAP32[$54>>2]|0;
   $56 = $55 & -2;
   HEAP32[$54>>2] = $56;
   $storemerge = $48;$storemerge1 = $45;
  } else {
   $57 = $47 | $43;
   $58 = $57 | 2;
   HEAP32[$2>>2] = $58;
   $59 = (($0) + ($43)|0);
   $60 = ((($59)) + 4|0);
   $61 = HEAP32[$60>>2]|0;
   $62 = $61 | 1;
   HEAP32[$60>>2] = $62;
   $storemerge = 0;$storemerge1 = 0;
  }
  HEAP32[(11728)>>2] = $storemerge1;
  HEAP32[(11740)>>2] = $storemerge;
  $$2 = $0;
  return ($$2|0);
 }
 $63 = ((($5)) + 4|0);
 $64 = HEAP32[$63>>2]|0;
 $65 = $64 & 2;
 $66 = ($65|0)==(0);
 if (!($66)) {
  $$2 = 0;
  return ($$2|0);
 }
 $67 = $64 & -8;
 $68 = (($67) + ($4))|0;
 $69 = ($68>>>0)<($1>>>0);
 if ($69) {
  $$2 = 0;
  return ($$2|0);
 }
 $70 = (($68) - ($1))|0;
 $71 = $64 >>> 3;
 $72 = ($64>>>0)<(256);
 do {
  if ($72) {
   $73 = ((($5)) + 8|0);
   $74 = HEAP32[$73>>2]|0;
   $75 = ((($5)) + 12|0);
   $76 = HEAP32[$75>>2]|0;
   $77 = ($76|0)==($74|0);
   if ($77) {
    $78 = 1 << $71;
    $79 = $78 ^ -1;
    $80 = HEAP32[2930]|0;
    $81 = $80 & $79;
    HEAP32[2930] = $81;
    break;
   } else {
    $82 = ((($74)) + 12|0);
    HEAP32[$82>>2] = $76;
    $83 = ((($76)) + 8|0);
    HEAP32[$83>>2] = $74;
    break;
   }
  } else {
   $84 = ((($5)) + 24|0);
   $85 = HEAP32[$84>>2]|0;
   $86 = ((($5)) + 12|0);
   $87 = HEAP32[$86>>2]|0;
   $88 = ($87|0)==($5|0);
   do {
    if ($88) {
     $93 = ((($5)) + 16|0);
     $94 = ((($93)) + 4|0);
     $95 = HEAP32[$94>>2]|0;
     $96 = ($95|0)==(0|0);
     if ($96) {
      $97 = HEAP32[$93>>2]|0;
      $98 = ($97|0)==(0|0);
      if ($98) {
       $$3 = 0;
       break;
      } else {
       $$1246 = $97;$$1249 = $93;
      }
     } else {
      $$1246 = $95;$$1249 = $94;
     }
     while(1) {
      $99 = ((($$1246)) + 20|0);
      $100 = HEAP32[$99>>2]|0;
      $101 = ($100|0)==(0|0);
      if (!($101)) {
       $$1246 = $100;$$1249 = $99;
       continue;
      }
      $102 = ((($$1246)) + 16|0);
      $103 = HEAP32[$102>>2]|0;
      $104 = ($103|0)==(0|0);
      if ($104) {
       break;
      } else {
       $$1246 = $103;$$1249 = $102;
      }
     }
     HEAP32[$$1249>>2] = 0;
     $$3 = $$1246;
    } else {
     $89 = ((($5)) + 8|0);
     $90 = HEAP32[$89>>2]|0;
     $91 = ((($90)) + 12|0);
     HEAP32[$91>>2] = $87;
     $92 = ((($87)) + 8|0);
     HEAP32[$92>>2] = $90;
     $$3 = $87;
    }
   } while(0);
   $105 = ($85|0)==(0|0);
   if (!($105)) {
    $106 = ((($5)) + 28|0);
    $107 = HEAP32[$106>>2]|0;
    $108 = (12024 + ($107<<2)|0);
    $109 = HEAP32[$108>>2]|0;
    $110 = ($5|0)==($109|0);
    if ($110) {
     HEAP32[$108>>2] = $$3;
     $cond = ($$3|0)==(0|0);
     if ($cond) {
      $111 = 1 << $107;
      $112 = $111 ^ -1;
      $113 = HEAP32[(11724)>>2]|0;
      $114 = $113 & $112;
      HEAP32[(11724)>>2] = $114;
      break;
     }
    } else {
     $115 = ((($85)) + 16|0);
     $116 = HEAP32[$115>>2]|0;
     $not$ = ($116|0)!=($5|0);
     $$sink1 = $not$&1;
     $117 = (((($85)) + 16|0) + ($$sink1<<2)|0);
     HEAP32[$117>>2] = $$3;
     $118 = ($$3|0)==(0|0);
     if ($118) {
      break;
     }
    }
    $119 = ((($$3)) + 24|0);
    HEAP32[$119>>2] = $85;
    $120 = ((($5)) + 16|0);
    $121 = HEAP32[$120>>2]|0;
    $122 = ($121|0)==(0|0);
    if (!($122)) {
     $123 = ((($$3)) + 16|0);
     HEAP32[$123>>2] = $121;
     $124 = ((($121)) + 24|0);
     HEAP32[$124>>2] = $$3;
    }
    $125 = ((($120)) + 4|0);
    $126 = HEAP32[$125>>2]|0;
    $127 = ($126|0)==(0|0);
    if (!($127)) {
     $128 = ((($$3)) + 20|0);
     HEAP32[$128>>2] = $126;
     $129 = ((($126)) + 24|0);
     HEAP32[$129>>2] = $$3;
    }
   }
  }
 } while(0);
 $130 = ($70>>>0)<(16);
 $131 = $3 & 1;
 if ($130) {
  $132 = $68 | $131;
  $133 = $132 | 2;
  HEAP32[$2>>2] = $133;
  $134 = (($0) + ($68)|0);
  $135 = ((($134)) + 4|0);
  $136 = HEAP32[$135>>2]|0;
  $137 = $136 | 1;
  HEAP32[$135>>2] = $137;
  $$2 = $0;
  return ($$2|0);
 } else {
  $138 = (($0) + ($1)|0);
  $139 = $131 | $1;
  $140 = $139 | 2;
  HEAP32[$2>>2] = $140;
  $141 = ((($138)) + 4|0);
  $142 = $70 | 3;
  HEAP32[$141>>2] = $142;
  $143 = (($138) + ($70)|0);
  $144 = ((($143)) + 4|0);
  $145 = HEAP32[$144>>2]|0;
  $146 = $145 | 1;
  HEAP32[$144>>2] = $146;
  _dispose_chunk($138,$70);
  $$2 = $0;
  return ($$2|0);
 }
 return (0)|0;
}
function _dispose_chunk($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0366 = 0, $$0367 = 0, $$0378 = 0, $$0385 = 0, $$1 = 0, $$1365 = 0, $$1373 = 0, $$1376 = 0, $$1380 = 0, $$1384 = 0, $$2 = 0, $$3 = 0, $$3382 = 0, $$pre = 0, $$pre$phiZ2D = 0, $$sink2 = 0, $$sink4 = 0, $10 = 0, $100 = 0, $101 = 0;
 var $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0;
 var $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0;
 var $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0;
 var $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0;
 var $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0;
 var $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0;
 var $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0;
 var $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0;
 var $cond = 0, $cond5 = 0, $not$ = 0, $not$1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (($0) + ($1)|0);
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = $4 & 1;
 $6 = ($5|0)==(0);
 do {
  if ($6) {
   $7 = HEAP32[$0>>2]|0;
   $8 = $4 & 3;
   $9 = ($8|0)==(0);
   if ($9) {
    return;
   }
   $10 = (0 - ($7))|0;
   $11 = (($0) + ($10)|0);
   $12 = (($7) + ($1))|0;
   $13 = HEAP32[(11740)>>2]|0;
   $14 = ($11|0)==($13|0);
   if ($14) {
    $74 = ((($2)) + 4|0);
    $75 = HEAP32[$74>>2]|0;
    $76 = $75 & 3;
    $77 = ($76|0)==(3);
    if (!($77)) {
     $$1 = $11;$$1365 = $12;
     break;
    }
    $78 = (($11) + ($12)|0);
    $79 = ((($11)) + 4|0);
    $80 = $12 | 1;
    $81 = $75 & -2;
    HEAP32[(11728)>>2] = $12;
    HEAP32[$74>>2] = $81;
    HEAP32[$79>>2] = $80;
    HEAP32[$78>>2] = $12;
    return;
   }
   $15 = $7 >>> 3;
   $16 = ($7>>>0)<(256);
   if ($16) {
    $17 = ((($11)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ((($11)) + 12|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = ($20|0)==($18|0);
    if ($21) {
     $22 = 1 << $15;
     $23 = $22 ^ -1;
     $24 = HEAP32[2930]|0;
     $25 = $24 & $23;
     HEAP32[2930] = $25;
     $$1 = $11;$$1365 = $12;
     break;
    } else {
     $26 = ((($18)) + 12|0);
     HEAP32[$26>>2] = $20;
     $27 = ((($20)) + 8|0);
     HEAP32[$27>>2] = $18;
     $$1 = $11;$$1365 = $12;
     break;
    }
   }
   $28 = ((($11)) + 24|0);
   $29 = HEAP32[$28>>2]|0;
   $30 = ((($11)) + 12|0);
   $31 = HEAP32[$30>>2]|0;
   $32 = ($31|0)==($11|0);
   do {
    if ($32) {
     $37 = ((($11)) + 16|0);
     $38 = ((($37)) + 4|0);
     $39 = HEAP32[$38>>2]|0;
     $40 = ($39|0)==(0|0);
     if ($40) {
      $41 = HEAP32[$37>>2]|0;
      $42 = ($41|0)==(0|0);
      if ($42) {
       $$3 = 0;
       break;
      } else {
       $$1373 = $41;$$1376 = $37;
      }
     } else {
      $$1373 = $39;$$1376 = $38;
     }
     while(1) {
      $43 = ((($$1373)) + 20|0);
      $44 = HEAP32[$43>>2]|0;
      $45 = ($44|0)==(0|0);
      if (!($45)) {
       $$1373 = $44;$$1376 = $43;
       continue;
      }
      $46 = ((($$1373)) + 16|0);
      $47 = HEAP32[$46>>2]|0;
      $48 = ($47|0)==(0|0);
      if ($48) {
       break;
      } else {
       $$1373 = $47;$$1376 = $46;
      }
     }
     HEAP32[$$1376>>2] = 0;
     $$3 = $$1373;
    } else {
     $33 = ((($11)) + 8|0);
     $34 = HEAP32[$33>>2]|0;
     $35 = ((($34)) + 12|0);
     HEAP32[$35>>2] = $31;
     $36 = ((($31)) + 8|0);
     HEAP32[$36>>2] = $34;
     $$3 = $31;
    }
   } while(0);
   $49 = ($29|0)==(0|0);
   if ($49) {
    $$1 = $11;$$1365 = $12;
   } else {
    $50 = ((($11)) + 28|0);
    $51 = HEAP32[$50>>2]|0;
    $52 = (12024 + ($51<<2)|0);
    $53 = HEAP32[$52>>2]|0;
    $54 = ($11|0)==($53|0);
    if ($54) {
     HEAP32[$52>>2] = $$3;
     $cond = ($$3|0)==(0|0);
     if ($cond) {
      $55 = 1 << $51;
      $56 = $55 ^ -1;
      $57 = HEAP32[(11724)>>2]|0;
      $58 = $57 & $56;
      HEAP32[(11724)>>2] = $58;
      $$1 = $11;$$1365 = $12;
      break;
     }
    } else {
     $59 = ((($29)) + 16|0);
     $60 = HEAP32[$59>>2]|0;
     $not$1 = ($60|0)!=($11|0);
     $$sink2 = $not$1&1;
     $61 = (((($29)) + 16|0) + ($$sink2<<2)|0);
     HEAP32[$61>>2] = $$3;
     $62 = ($$3|0)==(0|0);
     if ($62) {
      $$1 = $11;$$1365 = $12;
      break;
     }
    }
    $63 = ((($$3)) + 24|0);
    HEAP32[$63>>2] = $29;
    $64 = ((($11)) + 16|0);
    $65 = HEAP32[$64>>2]|0;
    $66 = ($65|0)==(0|0);
    if (!($66)) {
     $67 = ((($$3)) + 16|0);
     HEAP32[$67>>2] = $65;
     $68 = ((($65)) + 24|0);
     HEAP32[$68>>2] = $$3;
    }
    $69 = ((($64)) + 4|0);
    $70 = HEAP32[$69>>2]|0;
    $71 = ($70|0)==(0|0);
    if ($71) {
     $$1 = $11;$$1365 = $12;
    } else {
     $72 = ((($$3)) + 20|0);
     HEAP32[$72>>2] = $70;
     $73 = ((($70)) + 24|0);
     HEAP32[$73>>2] = $$3;
     $$1 = $11;$$1365 = $12;
    }
   }
  } else {
   $$1 = $0;$$1365 = $1;
  }
 } while(0);
 $82 = ((($2)) + 4|0);
 $83 = HEAP32[$82>>2]|0;
 $84 = $83 & 2;
 $85 = ($84|0)==(0);
 if ($85) {
  $86 = HEAP32[(11744)>>2]|0;
  $87 = ($2|0)==($86|0);
  $88 = HEAP32[(11740)>>2]|0;
  if ($87) {
   $89 = HEAP32[(11732)>>2]|0;
   $90 = (($89) + ($$1365))|0;
   HEAP32[(11732)>>2] = $90;
   HEAP32[(11744)>>2] = $$1;
   $91 = $90 | 1;
   $92 = ((($$1)) + 4|0);
   HEAP32[$92>>2] = $91;
   $93 = ($$1|0)==($88|0);
   if (!($93)) {
    return;
   }
   HEAP32[(11740)>>2] = 0;
   HEAP32[(11728)>>2] = 0;
   return;
  }
  $94 = ($2|0)==($88|0);
  if ($94) {
   $95 = HEAP32[(11728)>>2]|0;
   $96 = (($95) + ($$1365))|0;
   HEAP32[(11728)>>2] = $96;
   HEAP32[(11740)>>2] = $$1;
   $97 = $96 | 1;
   $98 = ((($$1)) + 4|0);
   HEAP32[$98>>2] = $97;
   $99 = (($$1) + ($96)|0);
   HEAP32[$99>>2] = $96;
   return;
  }
  $100 = $83 & -8;
  $101 = (($100) + ($$1365))|0;
  $102 = $83 >>> 3;
  $103 = ($83>>>0)<(256);
  do {
   if ($103) {
    $104 = ((($2)) + 8|0);
    $105 = HEAP32[$104>>2]|0;
    $106 = ((($2)) + 12|0);
    $107 = HEAP32[$106>>2]|0;
    $108 = ($107|0)==($105|0);
    if ($108) {
     $109 = 1 << $102;
     $110 = $109 ^ -1;
     $111 = HEAP32[2930]|0;
     $112 = $111 & $110;
     HEAP32[2930] = $112;
     break;
    } else {
     $113 = ((($105)) + 12|0);
     HEAP32[$113>>2] = $107;
     $114 = ((($107)) + 8|0);
     HEAP32[$114>>2] = $105;
     break;
    }
   } else {
    $115 = ((($2)) + 24|0);
    $116 = HEAP32[$115>>2]|0;
    $117 = ((($2)) + 12|0);
    $118 = HEAP32[$117>>2]|0;
    $119 = ($118|0)==($2|0);
    do {
     if ($119) {
      $124 = ((($2)) + 16|0);
      $125 = ((($124)) + 4|0);
      $126 = HEAP32[$125>>2]|0;
      $127 = ($126|0)==(0|0);
      if ($127) {
       $128 = HEAP32[$124>>2]|0;
       $129 = ($128|0)==(0|0);
       if ($129) {
        $$3382 = 0;
        break;
       } else {
        $$1380 = $128;$$1384 = $124;
       }
      } else {
       $$1380 = $126;$$1384 = $125;
      }
      while(1) {
       $130 = ((($$1380)) + 20|0);
       $131 = HEAP32[$130>>2]|0;
       $132 = ($131|0)==(0|0);
       if (!($132)) {
        $$1380 = $131;$$1384 = $130;
        continue;
       }
       $133 = ((($$1380)) + 16|0);
       $134 = HEAP32[$133>>2]|0;
       $135 = ($134|0)==(0|0);
       if ($135) {
        break;
       } else {
        $$1380 = $134;$$1384 = $133;
       }
      }
      HEAP32[$$1384>>2] = 0;
      $$3382 = $$1380;
     } else {
      $120 = ((($2)) + 8|0);
      $121 = HEAP32[$120>>2]|0;
      $122 = ((($121)) + 12|0);
      HEAP32[$122>>2] = $118;
      $123 = ((($118)) + 8|0);
      HEAP32[$123>>2] = $121;
      $$3382 = $118;
     }
    } while(0);
    $136 = ($116|0)==(0|0);
    if (!($136)) {
     $137 = ((($2)) + 28|0);
     $138 = HEAP32[$137>>2]|0;
     $139 = (12024 + ($138<<2)|0);
     $140 = HEAP32[$139>>2]|0;
     $141 = ($2|0)==($140|0);
     if ($141) {
      HEAP32[$139>>2] = $$3382;
      $cond5 = ($$3382|0)==(0|0);
      if ($cond5) {
       $142 = 1 << $138;
       $143 = $142 ^ -1;
       $144 = HEAP32[(11724)>>2]|0;
       $145 = $144 & $143;
       HEAP32[(11724)>>2] = $145;
       break;
      }
     } else {
      $146 = ((($116)) + 16|0);
      $147 = HEAP32[$146>>2]|0;
      $not$ = ($147|0)!=($2|0);
      $$sink4 = $not$&1;
      $148 = (((($116)) + 16|0) + ($$sink4<<2)|0);
      HEAP32[$148>>2] = $$3382;
      $149 = ($$3382|0)==(0|0);
      if ($149) {
       break;
      }
     }
     $150 = ((($$3382)) + 24|0);
     HEAP32[$150>>2] = $116;
     $151 = ((($2)) + 16|0);
     $152 = HEAP32[$151>>2]|0;
     $153 = ($152|0)==(0|0);
     if (!($153)) {
      $154 = ((($$3382)) + 16|0);
      HEAP32[$154>>2] = $152;
      $155 = ((($152)) + 24|0);
      HEAP32[$155>>2] = $$3382;
     }
     $156 = ((($151)) + 4|0);
     $157 = HEAP32[$156>>2]|0;
     $158 = ($157|0)==(0|0);
     if (!($158)) {
      $159 = ((($$3382)) + 20|0);
      HEAP32[$159>>2] = $157;
      $160 = ((($157)) + 24|0);
      HEAP32[$160>>2] = $$3382;
     }
    }
   }
  } while(0);
  $161 = $101 | 1;
  $162 = ((($$1)) + 4|0);
  HEAP32[$162>>2] = $161;
  $163 = (($$1) + ($101)|0);
  HEAP32[$163>>2] = $101;
  $164 = HEAP32[(11740)>>2]|0;
  $165 = ($$1|0)==($164|0);
  if ($165) {
   HEAP32[(11728)>>2] = $101;
   return;
  } else {
   $$2 = $101;
  }
 } else {
  $166 = $83 & -2;
  HEAP32[$82>>2] = $166;
  $167 = $$1365 | 1;
  $168 = ((($$1)) + 4|0);
  HEAP32[$168>>2] = $167;
  $169 = (($$1) + ($$1365)|0);
  HEAP32[$169>>2] = $$1365;
  $$2 = $$1365;
 }
 $170 = $$2 >>> 3;
 $171 = ($$2>>>0)<(256);
 if ($171) {
  $172 = $170 << 1;
  $173 = (11760 + ($172<<2)|0);
  $174 = HEAP32[2930]|0;
  $175 = 1 << $170;
  $176 = $174 & $175;
  $177 = ($176|0)==(0);
  if ($177) {
   $178 = $174 | $175;
   HEAP32[2930] = $178;
   $$pre = ((($173)) + 8|0);
   $$0385 = $173;$$pre$phiZ2D = $$pre;
  } else {
   $179 = ((($173)) + 8|0);
   $180 = HEAP32[$179>>2]|0;
   $$0385 = $180;$$pre$phiZ2D = $179;
  }
  HEAP32[$$pre$phiZ2D>>2] = $$1;
  $181 = ((($$0385)) + 12|0);
  HEAP32[$181>>2] = $$1;
  $182 = ((($$1)) + 8|0);
  HEAP32[$182>>2] = $$0385;
  $183 = ((($$1)) + 12|0);
  HEAP32[$183>>2] = $173;
  return;
 }
 $184 = $$2 >>> 8;
 $185 = ($184|0)==(0);
 if ($185) {
  $$0378 = 0;
 } else {
  $186 = ($$2>>>0)>(16777215);
  if ($186) {
   $$0378 = 31;
  } else {
   $187 = (($184) + 1048320)|0;
   $188 = $187 >>> 16;
   $189 = $188 & 8;
   $190 = $184 << $189;
   $191 = (($190) + 520192)|0;
   $192 = $191 >>> 16;
   $193 = $192 & 4;
   $194 = $193 | $189;
   $195 = $190 << $193;
   $196 = (($195) + 245760)|0;
   $197 = $196 >>> 16;
   $198 = $197 & 2;
   $199 = $194 | $198;
   $200 = (14 - ($199))|0;
   $201 = $195 << $198;
   $202 = $201 >>> 15;
   $203 = (($200) + ($202))|0;
   $204 = $203 << 1;
   $205 = (($203) + 7)|0;
   $206 = $$2 >>> $205;
   $207 = $206 & 1;
   $208 = $207 | $204;
   $$0378 = $208;
  }
 }
 $209 = (12024 + ($$0378<<2)|0);
 $210 = ((($$1)) + 28|0);
 HEAP32[$210>>2] = $$0378;
 $211 = ((($$1)) + 16|0);
 $212 = ((($$1)) + 20|0);
 HEAP32[$212>>2] = 0;
 HEAP32[$211>>2] = 0;
 $213 = HEAP32[(11724)>>2]|0;
 $214 = 1 << $$0378;
 $215 = $213 & $214;
 $216 = ($215|0)==(0);
 if ($216) {
  $217 = $213 | $214;
  HEAP32[(11724)>>2] = $217;
  HEAP32[$209>>2] = $$1;
  $218 = ((($$1)) + 24|0);
  HEAP32[$218>>2] = $209;
  $219 = ((($$1)) + 12|0);
  HEAP32[$219>>2] = $$1;
  $220 = ((($$1)) + 8|0);
  HEAP32[$220>>2] = $$1;
  return;
 }
 $221 = HEAP32[$209>>2]|0;
 $222 = ($$0378|0)==(31);
 $223 = $$0378 >>> 1;
 $224 = (25 - ($223))|0;
 $225 = $222 ? 0 : $224;
 $226 = $$2 << $225;
 $$0366 = $226;$$0367 = $221;
 while(1) {
  $227 = ((($$0367)) + 4|0);
  $228 = HEAP32[$227>>2]|0;
  $229 = $228 & -8;
  $230 = ($229|0)==($$2|0);
  if ($230) {
   label = 69;
   break;
  }
  $231 = $$0366 >>> 31;
  $232 = (((($$0367)) + 16|0) + ($231<<2)|0);
  $233 = $$0366 << 1;
  $234 = HEAP32[$232>>2]|0;
  $235 = ($234|0)==(0|0);
  if ($235) {
   label = 68;
   break;
  } else {
   $$0366 = $233;$$0367 = $234;
  }
 }
 if ((label|0) == 68) {
  HEAP32[$232>>2] = $$1;
  $236 = ((($$1)) + 24|0);
  HEAP32[$236>>2] = $$0367;
  $237 = ((($$1)) + 12|0);
  HEAP32[$237>>2] = $$1;
  $238 = ((($$1)) + 8|0);
  HEAP32[$238>>2] = $$1;
  return;
 }
 else if ((label|0) == 69) {
  $239 = ((($$0367)) + 8|0);
  $240 = HEAP32[$239>>2]|0;
  $241 = ((($240)) + 12|0);
  HEAP32[$241>>2] = $$1;
  HEAP32[$239>>2] = $$1;
  $242 = ((($$1)) + 8|0);
  HEAP32[$242>>2] = $240;
  $243 = ((($$1)) + 12|0);
  HEAP32[$243>>2] = $$0367;
  $244 = ((($$1)) + 24|0);
  HEAP32[$244>>2] = 0;
  return;
 }
}
function _emscripten_get_global_libc() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (12216|0);
}
function ___stdio_close($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $1 = ((($0)) + 60|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = (_dummy($2)|0);
 HEAP32[$vararg_buffer>>2] = $3;
 $4 = (___syscall6(6,($vararg_buffer|0))|0);
 $5 = (___syscall_ret($4)|0);
 STACKTOP = sp;return ($5|0);
}
function ___stdio_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0;
 var $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $3 = sp + 32|0;
 $4 = ((($0)) + 28|0);
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$3>>2] = $5;
 $6 = ((($3)) + 4|0);
 $7 = ((($0)) + 20|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = (($8) - ($5))|0;
 HEAP32[$6>>2] = $9;
 $10 = ((($3)) + 8|0);
 HEAP32[$10>>2] = $1;
 $11 = ((($3)) + 12|0);
 HEAP32[$11>>2] = $2;
 $12 = (($9) + ($2))|0;
 $13 = ((($0)) + 60|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = $3;
 HEAP32[$vararg_buffer>>2] = $14;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $15;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = 2;
 $16 = (___syscall146(146,($vararg_buffer|0))|0);
 $17 = (___syscall_ret($16)|0);
 $18 = ($12|0)==($17|0);
 L1: do {
  if ($18) {
   label = 3;
  } else {
   $$04756 = 2;$$04855 = $12;$$04954 = $3;$26 = $17;
   while(1) {
    $25 = ($26|0)<(0);
    if ($25) {
     break;
    }
    $34 = (($$04855) - ($26))|0;
    $35 = ((($$04954)) + 4|0);
    $36 = HEAP32[$35>>2]|0;
    $37 = ($26>>>0)>($36>>>0);
    $38 = ((($$04954)) + 8|0);
    $$150 = $37 ? $38 : $$04954;
    $39 = $37 << 31 >> 31;
    $$1 = (($39) + ($$04756))|0;
    $40 = $37 ? $36 : 0;
    $$0 = (($26) - ($40))|0;
    $41 = HEAP32[$$150>>2]|0;
    $42 = (($41) + ($$0)|0);
    HEAP32[$$150>>2] = $42;
    $43 = ((($$150)) + 4|0);
    $44 = HEAP32[$43>>2]|0;
    $45 = (($44) - ($$0))|0;
    HEAP32[$43>>2] = $45;
    $46 = HEAP32[$13>>2]|0;
    $47 = $$150;
    HEAP32[$vararg_buffer3>>2] = $46;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $47;
    $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
    HEAP32[$vararg_ptr7>>2] = $$1;
    $48 = (___syscall146(146,($vararg_buffer3|0))|0);
    $49 = (___syscall_ret($48)|0);
    $50 = ($34|0)==($49|0);
    if ($50) {
     label = 3;
     break L1;
    } else {
     $$04756 = $$1;$$04855 = $34;$$04954 = $$150;$26 = $49;
    }
   }
   $27 = ((($0)) + 16|0);
   HEAP32[$27>>2] = 0;
   HEAP32[$4>>2] = 0;
   HEAP32[$7>>2] = 0;
   $28 = HEAP32[$0>>2]|0;
   $29 = $28 | 32;
   HEAP32[$0>>2] = $29;
   $30 = ($$04756|0)==(2);
   if ($30) {
    $$051 = 0;
   } else {
    $31 = ((($$04954)) + 4|0);
    $32 = HEAP32[$31>>2]|0;
    $33 = (($2) - ($32))|0;
    $$051 = $33;
   }
  }
 } while(0);
 if ((label|0) == 3) {
  $19 = ((($0)) + 44|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ((($0)) + 48|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = (($20) + ($22)|0);
  $24 = ((($0)) + 16|0);
  HEAP32[$24>>2] = $23;
  HEAP32[$4>>2] = $20;
  HEAP32[$7>>2] = $20;
  $$051 = $2;
 }
 STACKTOP = sp;return ($$051|0);
}
function ___stdio_seek($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$pre = 0, $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 20|0;
 $4 = ((($0)) + 60|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $3;
 HEAP32[$vararg_buffer>>2] = $5;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $1;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $6;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $2;
 $7 = (___syscall140(140,($vararg_buffer|0))|0);
 $8 = (___syscall_ret($7)|0);
 $9 = ($8|0)<(0);
 if ($9) {
  HEAP32[$3>>2] = -1;
  $10 = -1;
 } else {
  $$pre = HEAP32[$3>>2]|0;
  $10 = $$pre;
 }
 STACKTOP = sp;return ($10|0);
}
function ___syscall_ret($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0>>>0)>(4294963200);
 if ($1) {
  $2 = (0 - ($0))|0;
  $3 = (___errno_location()|0);
  HEAP32[$3>>2] = $2;
  $$0 = -1;
 } else {
  $$0 = $0;
 }
 return ($$0|0);
}
function ___errno_location() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (___pthread_self_85()|0);
 $1 = ((($0)) + 64|0);
 return ($1|0);
}
function ___pthread_self_85() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function _pthread_self() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3948|0);
}
function _dummy($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($0|0);
}
function ___stdout_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 16|0;
 $4 = ((($0)) + 36|0);
 HEAP32[$4>>2] = 2;
 $5 = HEAP32[$0>>2]|0;
 $6 = $5 & 64;
 $7 = ($6|0)==(0);
 if ($7) {
  $8 = ((($0)) + 60|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = $3;
  HEAP32[$vararg_buffer>>2] = $9;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21523;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $10;
  $11 = (___syscall54(54,($vararg_buffer|0))|0);
  $12 = ($11|0)==(0);
  if (!($12)) {
   $13 = ((($0)) + 75|0);
   HEAP8[$13>>0] = -1;
  }
 }
 $14 = (___stdio_write($0,$1,$2)|0);
 STACKTOP = sp;return ($14|0);
}
function _strcmp($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $2 = HEAP8[$0>>0]|0;
 $3 = HEAP8[$1>>0]|0;
 $4 = ($2<<24>>24)!=($3<<24>>24);
 $5 = ($2<<24>>24)==(0);
 $or$cond9 = $5 | $4;
 if ($or$cond9) {
  $$lcssa = $3;$$lcssa8 = $2;
 } else {
  $$011 = $1;$$0710 = $0;
  while(1) {
   $6 = ((($$0710)) + 1|0);
   $7 = ((($$011)) + 1|0);
   $8 = HEAP8[$6>>0]|0;
   $9 = HEAP8[$7>>0]|0;
   $10 = ($8<<24>>24)!=($9<<24>>24);
   $11 = ($8<<24>>24)==(0);
   $or$cond = $11 | $10;
   if ($or$cond) {
    $$lcssa = $9;$$lcssa8 = $8;
    break;
   } else {
    $$011 = $7;$$0710 = $6;
   }
  }
 }
 $12 = $$lcssa8&255;
 $13 = $$lcssa&255;
 $14 = (($12) - ($13))|0;
 return ($14|0);
}
function _strlen($0) {
 $0 = $0|0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$pre = 0, $$sink = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = $0;
 $2 = $1 & 3;
 $3 = ($2|0)==(0);
 L1: do {
  if ($3) {
   $$015$lcssa = $0;
   label = 4;
  } else {
   $$01519 = $0;$23 = $1;
   while(1) {
    $4 = HEAP8[$$01519>>0]|0;
    $5 = ($4<<24>>24)==(0);
    if ($5) {
     $$sink = $23;
     break L1;
    }
    $6 = ((($$01519)) + 1|0);
    $7 = $6;
    $8 = $7 & 3;
    $9 = ($8|0)==(0);
    if ($9) {
     $$015$lcssa = $6;
     label = 4;
     break;
    } else {
     $$01519 = $6;$23 = $7;
    }
   }
  }
 } while(0);
 if ((label|0) == 4) {
  $$0 = $$015$lcssa;
  while(1) {
   $10 = HEAP32[$$0>>2]|0;
   $11 = (($10) + -16843009)|0;
   $12 = $10 & -2139062144;
   $13 = $12 ^ -2139062144;
   $14 = $13 & $11;
   $15 = ($14|0)==(0);
   $16 = ((($$0)) + 4|0);
   if ($15) {
    $$0 = $16;
   } else {
    break;
   }
  }
  $17 = $10&255;
  $18 = ($17<<24>>24)==(0);
  if ($18) {
   $$1$lcssa = $$0;
  } else {
   $$pn = $$0;
   while(1) {
    $19 = ((($$pn)) + 1|0);
    $$pre = HEAP8[$19>>0]|0;
    $20 = ($$pre<<24>>24)==(0);
    if ($20) {
     $$1$lcssa = $19;
     break;
    } else {
     $$pn = $19;
    }
   }
  }
  $21 = $$1$lcssa;
  $$sink = $21;
 }
 $22 = (($$sink) - ($1))|0;
 return ($22|0);
}
function ___unlockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function ___lockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function ___overflow($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 $3 = $1&255;
 HEAP8[$2>>0] = $3;
 $4 = ((($0)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $7 = (___towrite($0)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$4>>2]|0;
   $12 = $$pre;
   label = 4;
  } else {
   $$0 = -1;
  }
 } else {
  $12 = $5;
  label = 4;
 }
 do {
  if ((label|0) == 4) {
   $9 = ((($0)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = ($10>>>0)<($12>>>0);
   if ($11) {
    $13 = $1 & 255;
    $14 = ((($0)) + 75|0);
    $15 = HEAP8[$14>>0]|0;
    $16 = $15 << 24 >> 24;
    $17 = ($13|0)==($16|0);
    if (!($17)) {
     $18 = ((($10)) + 1|0);
     HEAP32[$9>>2] = $18;
     HEAP8[$10>>0] = $3;
     $$0 = $13;
     break;
    }
   }
   $19 = ((($0)) + 36|0);
   $20 = HEAP32[$19>>2]|0;
   $21 = (FUNCTION_TABLE_iiii[$20 & 127]($0,$2,1)|0);
   $22 = ($21|0)==(1);
   if ($22) {
    $23 = HEAP8[$2>>0]|0;
    $24 = $23&255;
    $$0 = $24;
   } else {
    $$0 = -1;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___towrite($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 74|0);
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $4 = (($3) + 255)|0;
 $5 = $4 | $3;
 $6 = $5&255;
 HEAP8[$1>>0] = $6;
 $7 = HEAP32[$0>>2]|0;
 $8 = $7 & 8;
 $9 = ($8|0)==(0);
 if ($9) {
  $11 = ((($0)) + 8|0);
  HEAP32[$11>>2] = 0;
  $12 = ((($0)) + 4|0);
  HEAP32[$12>>2] = 0;
  $13 = ((($0)) + 44|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = ((($0)) + 28|0);
  HEAP32[$15>>2] = $14;
  $16 = ((($0)) + 20|0);
  HEAP32[$16>>2] = $14;
  $17 = ((($0)) + 48|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = (($14) + ($18)|0);
  $20 = ((($0)) + 16|0);
  HEAP32[$20>>2] = $19;
  $$0 = 0;
 } else {
  $10 = $7 | 32;
  HEAP32[$0>>2] = $10;
  $$0 = -1;
 }
 return ($$0|0);
}
function ___fwritex($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$038 = 0, $$042 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $$pre = 0, $$pre47 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($2)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(0|0);
 if ($5) {
  $7 = (___towrite($2)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$3>>2]|0;
   $12 = $$pre;
   label = 5;
  } else {
   $$1 = 0;
  }
 } else {
  $6 = $4;
  $12 = $6;
  label = 5;
 }
 L5: do {
  if ((label|0) == 5) {
   $9 = ((($2)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = (($12) - ($10))|0;
   $13 = ($11>>>0)<($1>>>0);
   $14 = $10;
   if ($13) {
    $15 = ((($2)) + 36|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = (FUNCTION_TABLE_iiii[$16 & 127]($2,$0,$1)|0);
    $$1 = $17;
    break;
   }
   $18 = ((($2)) + 75|0);
   $19 = HEAP8[$18>>0]|0;
   $20 = ($19<<24>>24)>(-1);
   L10: do {
    if ($20) {
     $$038 = $1;
     while(1) {
      $21 = ($$038|0)==(0);
      if ($21) {
       $$139 = 0;$$141 = $0;$$143 = $1;$31 = $14;
       break L10;
      }
      $22 = (($$038) + -1)|0;
      $23 = (($0) + ($22)|0);
      $24 = HEAP8[$23>>0]|0;
      $25 = ($24<<24>>24)==(10);
      if ($25) {
       break;
      } else {
       $$038 = $22;
      }
     }
     $26 = ((($2)) + 36|0);
     $27 = HEAP32[$26>>2]|0;
     $28 = (FUNCTION_TABLE_iiii[$27 & 127]($2,$0,$$038)|0);
     $29 = ($28>>>0)<($$038>>>0);
     if ($29) {
      $$1 = $28;
      break L5;
     }
     $30 = (($0) + ($$038)|0);
     $$042 = (($1) - ($$038))|0;
     $$pre47 = HEAP32[$9>>2]|0;
     $$139 = $$038;$$141 = $30;$$143 = $$042;$31 = $$pre47;
    } else {
     $$139 = 0;$$141 = $0;$$143 = $1;$31 = $14;
    }
   } while(0);
   _memcpy(($31|0),($$141|0),($$143|0))|0;
   $32 = HEAP32[$9>>2]|0;
   $33 = (($32) + ($$143)|0);
   HEAP32[$9>>2] = $33;
   $34 = (($$139) + ($$143))|0;
   $$1 = $34;
  }
 } while(0);
 return ($$1|0);
}
function ___lctrans_impl($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = HEAP32[$1>>2]|0;
  $4 = ((($1)) + 4|0);
  $5 = HEAP32[$4>>2]|0;
  $6 = (___mo_lookup($3,$5,$0)|0);
  $$0 = $6;
 }
 $7 = ($$0|0)!=(0|0);
 $8 = $7 ? $$0 : $0;
 return ($8|0);
}
function ___mo_lookup($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$090 = 0, $$094 = 0, $$191 = 0, $$195 = 0, $$4 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond102 = 0, $or$cond104 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = (($3) + 1794895138)|0;
 $5 = ((($0)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (_swapc($6,$4)|0);
 $8 = ((($0)) + 12|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = (_swapc($9,$4)|0);
 $11 = ((($0)) + 16|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = (_swapc($12,$4)|0);
 $14 = $1 >>> 2;
 $15 = ($7>>>0)<($14>>>0);
 L1: do {
  if ($15) {
   $16 = $7 << 2;
   $17 = (($1) - ($16))|0;
   $18 = ($10>>>0)<($17>>>0);
   $19 = ($13>>>0)<($17>>>0);
   $or$cond = $18 & $19;
   if ($or$cond) {
    $20 = $13 | $10;
    $21 = $20 & 3;
    $22 = ($21|0)==(0);
    if ($22) {
     $23 = $10 >>> 2;
     $24 = $13 >>> 2;
     $$090 = 0;$$094 = $7;
     while(1) {
      $25 = $$094 >>> 1;
      $26 = (($$090) + ($25))|0;
      $27 = $26 << 1;
      $28 = (($27) + ($23))|0;
      $29 = (($0) + ($28<<2)|0);
      $30 = HEAP32[$29>>2]|0;
      $31 = (_swapc($30,$4)|0);
      $32 = (($28) + 1)|0;
      $33 = (($0) + ($32<<2)|0);
      $34 = HEAP32[$33>>2]|0;
      $35 = (_swapc($34,$4)|0);
      $36 = ($35>>>0)<($1>>>0);
      $37 = (($1) - ($35))|0;
      $38 = ($31>>>0)<($37>>>0);
      $or$cond102 = $36 & $38;
      if (!($or$cond102)) {
       $$4 = 0;
       break L1;
      }
      $39 = (($35) + ($31))|0;
      $40 = (($0) + ($39)|0);
      $41 = HEAP8[$40>>0]|0;
      $42 = ($41<<24>>24)==(0);
      if (!($42)) {
       $$4 = 0;
       break L1;
      }
      $43 = (($0) + ($35)|0);
      $44 = (_strcmp($2,$43)|0);
      $45 = ($44|0)==(0);
      if ($45) {
       break;
      }
      $62 = ($$094|0)==(1);
      $63 = ($44|0)<(0);
      $64 = (($$094) - ($25))|0;
      $$195 = $63 ? $25 : $64;
      $$191 = $63 ? $$090 : $26;
      if ($62) {
       $$4 = 0;
       break L1;
      } else {
       $$090 = $$191;$$094 = $$195;
      }
     }
     $46 = (($27) + ($24))|0;
     $47 = (($0) + ($46<<2)|0);
     $48 = HEAP32[$47>>2]|0;
     $49 = (_swapc($48,$4)|0);
     $50 = (($46) + 1)|0;
     $51 = (($0) + ($50<<2)|0);
     $52 = HEAP32[$51>>2]|0;
     $53 = (_swapc($52,$4)|0);
     $54 = ($53>>>0)<($1>>>0);
     $55 = (($1) - ($53))|0;
     $56 = ($49>>>0)<($55>>>0);
     $or$cond104 = $54 & $56;
     if ($or$cond104) {
      $57 = (($0) + ($53)|0);
      $58 = (($53) + ($49))|0;
      $59 = (($0) + ($58)|0);
      $60 = HEAP8[$59>>0]|0;
      $61 = ($60<<24>>24)==(0);
      $$ = $61 ? $57 : 0;
      $$4 = $$;
     } else {
      $$4 = 0;
     }
    } else {
     $$4 = 0;
    }
   } else {
    $$4 = 0;
   }
  } else {
   $$4 = 0;
  }
 } while(0);
 return ($$4|0);
}
function _swapc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$ = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(0);
 $3 = (_llvm_bswap_i32(($0|0))|0);
 $$ = $2 ? $0 : $3;
 return ($$|0);
}
function _memchr($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond53 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1 & 255;
 $4 = $0;
 $5 = $4 & 3;
 $6 = ($5|0)!=(0);
 $7 = ($2|0)!=(0);
 $or$cond53 = $7 & $6;
 L1: do {
  if ($or$cond53) {
   $8 = $1&255;
   $$03555 = $0;$$03654 = $2;
   while(1) {
    $9 = HEAP8[$$03555>>0]|0;
    $10 = ($9<<24>>24)==($8<<24>>24);
    if ($10) {
     $$035$lcssa65 = $$03555;$$036$lcssa64 = $$03654;
     label = 6;
     break L1;
    }
    $11 = ((($$03555)) + 1|0);
    $12 = (($$03654) + -1)|0;
    $13 = $11;
    $14 = $13 & 3;
    $15 = ($14|0)!=(0);
    $16 = ($12|0)!=(0);
    $or$cond = $16 & $15;
    if ($or$cond) {
     $$03555 = $11;$$03654 = $12;
    } else {
     $$035$lcssa = $11;$$036$lcssa = $12;$$lcssa = $16;
     label = 5;
     break;
    }
   }
  } else {
   $$035$lcssa = $0;$$036$lcssa = $2;$$lcssa = $7;
   label = 5;
  }
 } while(0);
 if ((label|0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa;$$036$lcssa64 = $$036$lcssa;
   label = 6;
  } else {
   $$2 = $$035$lcssa;$$3 = 0;
  }
 }
 L8: do {
  if ((label|0) == 6) {
   $17 = HEAP8[$$035$lcssa65>>0]|0;
   $18 = $1&255;
   $19 = ($17<<24>>24)==($18<<24>>24);
   if ($19) {
    $$2 = $$035$lcssa65;$$3 = $$036$lcssa64;
   } else {
    $20 = Math_imul($3, 16843009)|0;
    $21 = ($$036$lcssa64>>>0)>(3);
    L11: do {
     if ($21) {
      $$046 = $$035$lcssa65;$$13745 = $$036$lcssa64;
      while(1) {
       $22 = HEAP32[$$046>>2]|0;
       $23 = $22 ^ $20;
       $24 = (($23) + -16843009)|0;
       $25 = $23 & -2139062144;
       $26 = $25 ^ -2139062144;
       $27 = $26 & $24;
       $28 = ($27|0)==(0);
       if (!($28)) {
        break;
       }
       $29 = ((($$046)) + 4|0);
       $30 = (($$13745) + -4)|0;
       $31 = ($30>>>0)>(3);
       if ($31) {
        $$046 = $29;$$13745 = $30;
       } else {
        $$0$lcssa = $29;$$137$lcssa = $30;
        label = 11;
        break L11;
       }
      }
      $$140 = $$046;$$23839 = $$13745;
     } else {
      $$0$lcssa = $$035$lcssa65;$$137$lcssa = $$036$lcssa64;
      label = 11;
     }
    } while(0);
    if ((label|0) == 11) {
     $32 = ($$137$lcssa|0)==(0);
     if ($32) {
      $$2 = $$0$lcssa;$$3 = 0;
      break;
     } else {
      $$140 = $$0$lcssa;$$23839 = $$137$lcssa;
     }
    }
    while(1) {
     $33 = HEAP8[$$140>>0]|0;
     $34 = ($33<<24>>24)==($18<<24>>24);
     if ($34) {
      $$2 = $$140;$$3 = $$23839;
      break L8;
     }
     $35 = ((($$140)) + 1|0);
     $36 = (($$23839) + -1)|0;
     $37 = ($36|0)==(0);
     if ($37) {
      $$2 = $35;$$3 = 0;
      break;
     } else {
      $$140 = $35;$$23839 = $36;
     }
    }
   }
  }
 } while(0);
 $38 = ($$3|0)!=(0);
 $39 = $38 ? $$2 : 0;
 return ($39|0);
}
function ___ofl_lock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___lock((12280|0));
 return (12288|0);
}
function ___ofl_unlock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___unlock((12280|0));
 return;
}
function _fflush($0) {
 $0 = $0|0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 do {
  if ($1) {
   $8 = HEAP32[1079]|0;
   $9 = ($8|0)==(0|0);
   if ($9) {
    $29 = 0;
   } else {
    $10 = HEAP32[1079]|0;
    $11 = (_fflush($10)|0);
    $29 = $11;
   }
   $12 = (___ofl_lock()|0);
   $$02325 = HEAP32[$12>>2]|0;
   $13 = ($$02325|0)==(0|0);
   if ($13) {
    $$024$lcssa = $29;
   } else {
    $$02327 = $$02325;$$02426 = $29;
    while(1) {
     $14 = ((($$02327)) + 76|0);
     $15 = HEAP32[$14>>2]|0;
     $16 = ($15|0)>(-1);
     if ($16) {
      $17 = (___lockfile($$02327)|0);
      $26 = $17;
     } else {
      $26 = 0;
     }
     $18 = ((($$02327)) + 20|0);
     $19 = HEAP32[$18>>2]|0;
     $20 = ((($$02327)) + 28|0);
     $21 = HEAP32[$20>>2]|0;
     $22 = ($19>>>0)>($21>>>0);
     if ($22) {
      $23 = (___fflush_unlocked($$02327)|0);
      $24 = $23 | $$02426;
      $$1 = $24;
     } else {
      $$1 = $$02426;
     }
     $25 = ($26|0)==(0);
     if (!($25)) {
      ___unlockfile($$02327);
     }
     $27 = ((($$02327)) + 56|0);
     $$023 = HEAP32[$27>>2]|0;
     $28 = ($$023|0)==(0|0);
     if ($28) {
      $$024$lcssa = $$1;
      break;
     } else {
      $$02327 = $$023;$$02426 = $$1;
     }
    }
   }
   ___ofl_unlock();
   $$0 = $$024$lcssa;
  } else {
   $2 = ((($0)) + 76|0);
   $3 = HEAP32[$2>>2]|0;
   $4 = ($3|0)>(-1);
   if (!($4)) {
    $5 = (___fflush_unlocked($0)|0);
    $$0 = $5;
    break;
   }
   $6 = (___lockfile($0)|0);
   $phitmp = ($6|0)==(0);
   $7 = (___fflush_unlocked($0)|0);
   if ($phitmp) {
    $$0 = $7;
   } else {
    ___unlockfile($0);
    $$0 = $7;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___fflush_unlocked($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 20|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 28|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($2>>>0)>($4>>>0);
 if ($5) {
  $6 = ((($0)) + 36|0);
  $7 = HEAP32[$6>>2]|0;
  (FUNCTION_TABLE_iiii[$7 & 127]($0,0,0)|0);
  $8 = HEAP32[$1>>2]|0;
  $9 = ($8|0)==(0|0);
  if ($9) {
   $$0 = -1;
  } else {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $10 = ((($0)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  $12 = ((($0)) + 8|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ($11>>>0)<($13>>>0);
  if ($14) {
   $15 = $11;
   $16 = $13;
   $17 = (($15) - ($16))|0;
   $18 = ((($0)) + 40|0);
   $19 = HEAP32[$18>>2]|0;
   (FUNCTION_TABLE_iiii[$19 & 127]($0,$17,1)|0);
  }
  $20 = ((($0)) + 16|0);
  HEAP32[$20>>2] = 0;
  HEAP32[$3>>2] = 0;
  HEAP32[$1>>2] = 0;
  HEAP32[$12>>2] = 0;
  HEAP32[$10>>2] = 0;
  $$0 = 0;
 }
 return ($$0|0);
}
function _vfprintf($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$0 = 0, $$1 = 0, $$1$ = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $vacopy_currentptr = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(224|0);
 $3 = sp + 120|0;
 $4 = sp + 80|0;
 $5 = sp;
 $6 = sp + 136|0;
 dest=$4; stop=dest+40|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 $vacopy_currentptr = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $vacopy_currentptr;
 $7 = (_printf_core(0,$1,$3,$5,$4)|0);
 $8 = ($7|0)<(0);
 if ($8) {
  $$0 = -1;
 } else {
  $9 = ((($0)) + 76|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ($10|0)>(-1);
  if ($11) {
   $12 = (___lockfile($0)|0);
   $40 = $12;
  } else {
   $40 = 0;
  }
  $13 = HEAP32[$0>>2]|0;
  $14 = $13 & 32;
  $15 = ((($0)) + 74|0);
  $16 = HEAP8[$15>>0]|0;
  $17 = ($16<<24>>24)<(1);
  if ($17) {
   $18 = $13 & -33;
   HEAP32[$0>>2] = $18;
  }
  $19 = ((($0)) + 48|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ($20|0)==(0);
  if ($21) {
   $23 = ((($0)) + 44|0);
   $24 = HEAP32[$23>>2]|0;
   HEAP32[$23>>2] = $6;
   $25 = ((($0)) + 28|0);
   HEAP32[$25>>2] = $6;
   $26 = ((($0)) + 20|0);
   HEAP32[$26>>2] = $6;
   HEAP32[$19>>2] = 80;
   $27 = ((($6)) + 80|0);
   $28 = ((($0)) + 16|0);
   HEAP32[$28>>2] = $27;
   $29 = (_printf_core($0,$1,$3,$5,$4)|0);
   $30 = ($24|0)==(0|0);
   if ($30) {
    $$1 = $29;
   } else {
    $31 = ((($0)) + 36|0);
    $32 = HEAP32[$31>>2]|0;
    (FUNCTION_TABLE_iiii[$32 & 127]($0,0,0)|0);
    $33 = HEAP32[$26>>2]|0;
    $34 = ($33|0)==(0|0);
    $$ = $34 ? -1 : $29;
    HEAP32[$23>>2] = $24;
    HEAP32[$19>>2] = 0;
    HEAP32[$28>>2] = 0;
    HEAP32[$25>>2] = 0;
    HEAP32[$26>>2] = 0;
    $$1 = $$;
   }
  } else {
   $22 = (_printf_core($0,$1,$3,$5,$4)|0);
   $$1 = $22;
  }
  $35 = HEAP32[$0>>2]|0;
  $36 = $35 & 32;
  $37 = ($36|0)==(0);
  $$1$ = $37 ? $$1 : -1;
  $38 = $35 | $14;
  HEAP32[$0>>2] = $38;
  $39 = ($40|0)==(0);
  if (!($39)) {
   ___unlockfile($0);
  }
  $$0 = $$1$;
 }
 STACKTOP = sp;return ($$0|0);
}
function _printf_core($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$ = 0, $$$ = 0, $$$0259 = 0, $$$0262 = 0, $$$0269 = 0, $$$4266 = 0, $$$5 = 0, $$0 = 0, $$0228 = 0, $$0228$ = 0, $$0229322 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa357 = 0, $$0240321 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0;
 var $$0249306 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0254$$0254$ = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262311 = 0, $$0269 = 0, $$0269$phi = 0, $$1 = 0, $$1230333 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241332 = 0, $$1244320 = 0, $$1248 = 0, $$1250 = 0, $$1255 = 0;
 var $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242305 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2256$ = 0, $$2256$$$2256 = 0, $$2261 = 0, $$2271 = 0, $$284$ = 0, $$289 = 0, $$290 = 0, $$3257 = 0, $$3265 = 0;
 var $$3272 = 0, $$3303 = 0, $$377 = 0, $$4258355 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa295 = 0, $$pre = 0, $$pre346 = 0, $$pre347 = 0, $$pre347$pre = 0, $$pre349 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0;
 var $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0;
 var $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0;
 var $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0;
 var $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0;
 var $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0;
 var $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0;
 var $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0;
 var $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0;
 var $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0;
 var $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0;
 var $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0;
 var $306 = 0.0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0;
 var $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0;
 var $arglist_current = 0, $arglist_current2 = 0, $arglist_next = 0, $arglist_next3 = 0, $expanded = 0, $expanded10 = 0, $expanded11 = 0, $expanded13 = 0, $expanded14 = 0, $expanded15 = 0, $expanded4 = 0, $expanded6 = 0, $expanded7 = 0, $expanded8 = 0, $isdigit = 0, $isdigit275 = 0, $isdigit277 = 0, $isdigittmp = 0, $isdigittmp$ = 0, $isdigittmp274 = 0;
 var $isdigittmp276 = 0, $narrow = 0, $or$cond = 0, $or$cond281 = 0, $or$cond283 = 0, $or$cond286 = 0, $storemerge = 0, $storemerge273310 = 0, $storemerge278 = 0, $trunc = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $5 = sp + 16|0;
 $6 = sp;
 $7 = sp + 24|0;
 $8 = sp + 8|0;
 $9 = sp + 20|0;
 HEAP32[$5>>2] = $1;
 $10 = ($0|0)!=(0|0);
 $11 = ((($7)) + 40|0);
 $12 = $11;
 $13 = ((($7)) + 39|0);
 $14 = ((($8)) + 4|0);
 $$0243 = 0;$$0247 = 0;$$0269 = 0;$21 = $1;
 L1: while(1) {
  $15 = ($$0247|0)>(-1);
  do {
   if ($15) {
    $16 = (2147483647 - ($$0247))|0;
    $17 = ($$0243|0)>($16|0);
    if ($17) {
     $18 = (___errno_location()|0);
     HEAP32[$18>>2] = 75;
     $$1248 = -1;
     break;
    } else {
     $19 = (($$0243) + ($$0247))|0;
     $$1248 = $19;
     break;
    }
   } else {
    $$1248 = $$0247;
   }
  } while(0);
  $20 = HEAP8[$21>>0]|0;
  $22 = ($20<<24>>24)==(0);
  if ($22) {
   label = 87;
   break;
  } else {
   $23 = $20;$25 = $21;
  }
  L9: while(1) {
   switch ($23<<24>>24) {
   case 37:  {
    $$0249306 = $25;$27 = $25;
    label = 9;
    break L9;
    break;
   }
   case 0:  {
    $$0249$lcssa = $25;$39 = $25;
    break L9;
    break;
   }
   default: {
   }
   }
   $24 = ((($25)) + 1|0);
   HEAP32[$5>>2] = $24;
   $$pre = HEAP8[$24>>0]|0;
   $23 = $$pre;$25 = $24;
  }
  L12: do {
   if ((label|0) == 9) {
    while(1) {
     label = 0;
     $26 = ((($27)) + 1|0);
     $28 = HEAP8[$26>>0]|0;
     $29 = ($28<<24>>24)==(37);
     if (!($29)) {
      $$0249$lcssa = $$0249306;$39 = $27;
      break L12;
     }
     $30 = ((($$0249306)) + 1|0);
     $31 = ((($27)) + 2|0);
     HEAP32[$5>>2] = $31;
     $32 = HEAP8[$31>>0]|0;
     $33 = ($32<<24>>24)==(37);
     if ($33) {
      $$0249306 = $30;$27 = $31;
      label = 9;
     } else {
      $$0249$lcssa = $30;$39 = $31;
      break;
     }
    }
   }
  } while(0);
  $34 = $$0249$lcssa;
  $35 = $21;
  $36 = (($34) - ($35))|0;
  if ($10) {
   _out_669($0,$21,$36);
  }
  $37 = ($36|0)==(0);
  if (!($37)) {
   $$0269$phi = $$0269;$$0243 = $36;$$0247 = $$1248;$21 = $39;$$0269 = $$0269$phi;
   continue;
  }
  $38 = ((($39)) + 1|0);
  $40 = HEAP8[$38>>0]|0;
  $41 = $40 << 24 >> 24;
  $isdigittmp = (($41) + -48)|0;
  $isdigit = ($isdigittmp>>>0)<(10);
  if ($isdigit) {
   $42 = ((($39)) + 2|0);
   $43 = HEAP8[$42>>0]|0;
   $44 = ($43<<24>>24)==(36);
   $45 = ((($39)) + 3|0);
   $$377 = $44 ? $45 : $38;
   $$$0269 = $44 ? 1 : $$0269;
   $isdigittmp$ = $44 ? $isdigittmp : -1;
   $$0253 = $isdigittmp$;$$1270 = $$$0269;$storemerge = $$377;
  } else {
   $$0253 = -1;$$1270 = $$0269;$storemerge = $38;
  }
  HEAP32[$5>>2] = $storemerge;
  $46 = HEAP8[$storemerge>>0]|0;
  $47 = $46 << 24 >> 24;
  $48 = (($47) + -32)|0;
  $49 = ($48>>>0)<(32);
  L24: do {
   if ($49) {
    $$0262311 = 0;$329 = $46;$51 = $48;$storemerge273310 = $storemerge;
    while(1) {
     $50 = 1 << $51;
     $52 = $50 & 75913;
     $53 = ($52|0)==(0);
     if ($53) {
      $$0262$lcssa = $$0262311;$$lcssa295 = $329;$62 = $storemerge273310;
      break L24;
     }
     $54 = $50 | $$0262311;
     $55 = ((($storemerge273310)) + 1|0);
     HEAP32[$5>>2] = $55;
     $56 = HEAP8[$55>>0]|0;
     $57 = $56 << 24 >> 24;
     $58 = (($57) + -32)|0;
     $59 = ($58>>>0)<(32);
     if ($59) {
      $$0262311 = $54;$329 = $56;$51 = $58;$storemerge273310 = $55;
     } else {
      $$0262$lcssa = $54;$$lcssa295 = $56;$62 = $55;
      break;
     }
    }
   } else {
    $$0262$lcssa = 0;$$lcssa295 = $46;$62 = $storemerge;
   }
  } while(0);
  $60 = ($$lcssa295<<24>>24)==(42);
  if ($60) {
   $61 = ((($62)) + 1|0);
   $63 = HEAP8[$61>>0]|0;
   $64 = $63 << 24 >> 24;
   $isdigittmp276 = (($64) + -48)|0;
   $isdigit277 = ($isdigittmp276>>>0)<(10);
   if ($isdigit277) {
    $65 = ((($62)) + 2|0);
    $66 = HEAP8[$65>>0]|0;
    $67 = ($66<<24>>24)==(36);
    if ($67) {
     $68 = (($4) + ($isdigittmp276<<2)|0);
     HEAP32[$68>>2] = 10;
     $69 = HEAP8[$61>>0]|0;
     $70 = $69 << 24 >> 24;
     $71 = (($70) + -48)|0;
     $72 = (($3) + ($71<<3)|0);
     $73 = $72;
     $74 = $73;
     $75 = HEAP32[$74>>2]|0;
     $76 = (($73) + 4)|0;
     $77 = $76;
     $78 = HEAP32[$77>>2]|0;
     $79 = ((($62)) + 3|0);
     $$0259 = $75;$$2271 = 1;$storemerge278 = $79;
    } else {
     label = 23;
    }
   } else {
    label = 23;
   }
   if ((label|0) == 23) {
    label = 0;
    $80 = ($$1270|0)==(0);
    if (!($80)) {
     $$0 = -1;
     break;
    }
    if ($10) {
     $arglist_current = HEAP32[$2>>2]|0;
     $81 = $arglist_current;
     $82 = ((0) + 4|0);
     $expanded4 = $82;
     $expanded = (($expanded4) - 1)|0;
     $83 = (($81) + ($expanded))|0;
     $84 = ((0) + 4|0);
     $expanded8 = $84;
     $expanded7 = (($expanded8) - 1)|0;
     $expanded6 = $expanded7 ^ -1;
     $85 = $83 & $expanded6;
     $86 = $85;
     $87 = HEAP32[$86>>2]|0;
     $arglist_next = ((($86)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     $$0259 = $87;$$2271 = 0;$storemerge278 = $61;
    } else {
     $$0259 = 0;$$2271 = 0;$storemerge278 = $61;
    }
   }
   HEAP32[$5>>2] = $storemerge278;
   $88 = ($$0259|0)<(0);
   $89 = $$0262$lcssa | 8192;
   $90 = (0 - ($$0259))|0;
   $$$0262 = $88 ? $89 : $$0262$lcssa;
   $$$0259 = $88 ? $90 : $$0259;
   $$1260 = $$$0259;$$1263 = $$$0262;$$3272 = $$2271;$94 = $storemerge278;
  } else {
   $91 = (_getint_670($5)|0);
   $92 = ($91|0)<(0);
   if ($92) {
    $$0 = -1;
    break;
   }
   $$pre346 = HEAP32[$5>>2]|0;
   $$1260 = $91;$$1263 = $$0262$lcssa;$$3272 = $$1270;$94 = $$pre346;
  }
  $93 = HEAP8[$94>>0]|0;
  $95 = ($93<<24>>24)==(46);
  do {
   if ($95) {
    $96 = ((($94)) + 1|0);
    $97 = HEAP8[$96>>0]|0;
    $98 = ($97<<24>>24)==(42);
    if (!($98)) {
     $125 = ((($94)) + 1|0);
     HEAP32[$5>>2] = $125;
     $126 = (_getint_670($5)|0);
     $$pre347$pre = HEAP32[$5>>2]|0;
     $$0254 = $126;$$pre347 = $$pre347$pre;
     break;
    }
    $99 = ((($94)) + 2|0);
    $100 = HEAP8[$99>>0]|0;
    $101 = $100 << 24 >> 24;
    $isdigittmp274 = (($101) + -48)|0;
    $isdigit275 = ($isdigittmp274>>>0)<(10);
    if ($isdigit275) {
     $102 = ((($94)) + 3|0);
     $103 = HEAP8[$102>>0]|0;
     $104 = ($103<<24>>24)==(36);
     if ($104) {
      $105 = (($4) + ($isdigittmp274<<2)|0);
      HEAP32[$105>>2] = 10;
      $106 = HEAP8[$99>>0]|0;
      $107 = $106 << 24 >> 24;
      $108 = (($107) + -48)|0;
      $109 = (($3) + ($108<<3)|0);
      $110 = $109;
      $111 = $110;
      $112 = HEAP32[$111>>2]|0;
      $113 = (($110) + 4)|0;
      $114 = $113;
      $115 = HEAP32[$114>>2]|0;
      $116 = ((($94)) + 4|0);
      HEAP32[$5>>2] = $116;
      $$0254 = $112;$$pre347 = $116;
      break;
     }
    }
    $117 = ($$3272|0)==(0);
    if (!($117)) {
     $$0 = -1;
     break L1;
    }
    if ($10) {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $118 = $arglist_current2;
     $119 = ((0) + 4|0);
     $expanded11 = $119;
     $expanded10 = (($expanded11) - 1)|0;
     $120 = (($118) + ($expanded10))|0;
     $121 = ((0) + 4|0);
     $expanded15 = $121;
     $expanded14 = (($expanded15) - 1)|0;
     $expanded13 = $expanded14 ^ -1;
     $122 = $120 & $expanded13;
     $123 = $122;
     $124 = HEAP32[$123>>2]|0;
     $arglist_next3 = ((($123)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $330 = $124;
    } else {
     $330 = 0;
    }
    HEAP32[$5>>2] = $99;
    $$0254 = $330;$$pre347 = $99;
   } else {
    $$0254 = -1;$$pre347 = $94;
   }
  } while(0);
  $$0252 = 0;$128 = $$pre347;
  while(1) {
   $127 = HEAP8[$128>>0]|0;
   $129 = $127 << 24 >> 24;
   $130 = (($129) + -65)|0;
   $131 = ($130>>>0)>(57);
   if ($131) {
    $$0 = -1;
    break L1;
   }
   $132 = ((($128)) + 1|0);
   HEAP32[$5>>2] = $132;
   $133 = HEAP8[$128>>0]|0;
   $134 = $133 << 24 >> 24;
   $135 = (($134) + -65)|0;
   $136 = ((8520 + (($$0252*58)|0)|0) + ($135)|0);
   $137 = HEAP8[$136>>0]|0;
   $138 = $137&255;
   $139 = (($138) + -1)|0;
   $140 = ($139>>>0)<(8);
   if ($140) {
    $$0252 = $138;$128 = $132;
   } else {
    break;
   }
  }
  $141 = ($137<<24>>24)==(0);
  if ($141) {
   $$0 = -1;
   break;
  }
  $142 = ($137<<24>>24)==(19);
  $143 = ($$0253|0)>(-1);
  do {
   if ($142) {
    if ($143) {
     $$0 = -1;
     break L1;
    } else {
     label = 49;
    }
   } else {
    if ($143) {
     $144 = (($4) + ($$0253<<2)|0);
     HEAP32[$144>>2] = $138;
     $145 = (($3) + ($$0253<<3)|0);
     $146 = $145;
     $147 = $146;
     $148 = HEAP32[$147>>2]|0;
     $149 = (($146) + 4)|0;
     $150 = $149;
     $151 = HEAP32[$150>>2]|0;
     $152 = $6;
     $153 = $152;
     HEAP32[$153>>2] = $148;
     $154 = (($152) + 4)|0;
     $155 = $154;
     HEAP32[$155>>2] = $151;
     label = 49;
     break;
    }
    if (!($10)) {
     $$0 = 0;
     break L1;
    }
    _pop_arg_672($6,$138,$2);
   }
  } while(0);
  if ((label|0) == 49) {
   label = 0;
   if (!($10)) {
    $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
    continue;
   }
  }
  $156 = HEAP8[$128>>0]|0;
  $157 = $156 << 24 >> 24;
  $158 = ($$0252|0)!=(0);
  $159 = $157 & 15;
  $160 = ($159|0)==(3);
  $or$cond281 = $158 & $160;
  $161 = $157 & -33;
  $$0235 = $or$cond281 ? $161 : $157;
  $162 = $$1263 & 8192;
  $163 = ($162|0)==(0);
  $164 = $$1263 & -65537;
  $$1263$ = $163 ? $$1263 : $164;
  L71: do {
   switch ($$0235|0) {
   case 110:  {
    $trunc = $$0252&255;
    switch ($trunc<<24>>24) {
    case 0:  {
     $171 = HEAP32[$6>>2]|0;
     HEAP32[$171>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 1:  {
     $172 = HEAP32[$6>>2]|0;
     HEAP32[$172>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 2:  {
     $173 = ($$1248|0)<(0);
     $174 = $173 << 31 >> 31;
     $175 = HEAP32[$6>>2]|0;
     $176 = $175;
     $177 = $176;
     HEAP32[$177>>2] = $$1248;
     $178 = (($176) + 4)|0;
     $179 = $178;
     HEAP32[$179>>2] = $174;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 3:  {
     $180 = $$1248&65535;
     $181 = HEAP32[$6>>2]|0;
     HEAP16[$181>>1] = $180;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 4:  {
     $182 = $$1248&255;
     $183 = HEAP32[$6>>2]|0;
     HEAP8[$183>>0] = $182;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 6:  {
     $184 = HEAP32[$6>>2]|0;
     HEAP32[$184>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 7:  {
     $185 = ($$1248|0)<(0);
     $186 = $185 << 31 >> 31;
     $187 = HEAP32[$6>>2]|0;
     $188 = $187;
     $189 = $188;
     HEAP32[$189>>2] = $$1248;
     $190 = (($188) + 4)|0;
     $191 = $190;
     HEAP32[$191>>2] = $186;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    default: {
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
    }
    }
    break;
   }
   case 112:  {
    $192 = ($$0254>>>0)>(8);
    $193 = $192 ? $$0254 : 8;
    $194 = $$1263$ | 8;
    $$1236 = 120;$$1255 = $193;$$3265 = $194;
    label = 61;
    break;
   }
   case 88: case 120:  {
    $$1236 = $$0235;$$1255 = $$0254;$$3265 = $$1263$;
    label = 61;
    break;
   }
   case 111:  {
    $210 = $6;
    $211 = $210;
    $212 = HEAP32[$211>>2]|0;
    $213 = (($210) + 4)|0;
    $214 = $213;
    $215 = HEAP32[$214>>2]|0;
    $216 = (_fmt_o($212,$215,$11)|0);
    $217 = $$1263$ & 8;
    $218 = ($217|0)==(0);
    $219 = $216;
    $220 = (($12) - ($219))|0;
    $221 = ($$0254|0)>($220|0);
    $222 = (($220) + 1)|0;
    $223 = $218 | $221;
    $$0254$$0254$ = $223 ? $$0254 : $222;
    $$0228 = $216;$$1233 = 0;$$1238 = 8984;$$2256 = $$0254$$0254$;$$4266 = $$1263$;$248 = $212;$250 = $215;
    label = 67;
    break;
   }
   case 105: case 100:  {
    $224 = $6;
    $225 = $224;
    $226 = HEAP32[$225>>2]|0;
    $227 = (($224) + 4)|0;
    $228 = $227;
    $229 = HEAP32[$228>>2]|0;
    $230 = ($229|0)<(0);
    if ($230) {
     $231 = (_i64Subtract(0,0,($226|0),($229|0))|0);
     $232 = tempRet0;
     $233 = $6;
     $234 = $233;
     HEAP32[$234>>2] = $231;
     $235 = (($233) + 4)|0;
     $236 = $235;
     HEAP32[$236>>2] = $232;
     $$0232 = 1;$$0237 = 8984;$242 = $231;$243 = $232;
     label = 66;
     break L71;
    } else {
     $237 = $$1263$ & 2048;
     $238 = ($237|0)==(0);
     $239 = $$1263$ & 1;
     $240 = ($239|0)==(0);
     $$ = $240 ? 8984 : (8986);
     $$$ = $238 ? $$ : (8985);
     $241 = $$1263$ & 2049;
     $narrow = ($241|0)!=(0);
     $$284$ = $narrow&1;
     $$0232 = $$284$;$$0237 = $$$;$242 = $226;$243 = $229;
     label = 66;
     break L71;
    }
    break;
   }
   case 117:  {
    $165 = $6;
    $166 = $165;
    $167 = HEAP32[$166>>2]|0;
    $168 = (($165) + 4)|0;
    $169 = $168;
    $170 = HEAP32[$169>>2]|0;
    $$0232 = 0;$$0237 = 8984;$242 = $167;$243 = $170;
    label = 66;
    break;
   }
   case 99:  {
    $259 = $6;
    $260 = $259;
    $261 = HEAP32[$260>>2]|0;
    $262 = (($259) + 4)|0;
    $263 = $262;
    $264 = HEAP32[$263>>2]|0;
    $265 = $261&255;
    HEAP8[$13>>0] = $265;
    $$2 = $13;$$2234 = 0;$$2239 = 8984;$$2251 = $11;$$5 = 1;$$6268 = $164;
    break;
   }
   case 109:  {
    $266 = (___errno_location()|0);
    $267 = HEAP32[$266>>2]|0;
    $268 = (_strerror($267)|0);
    $$1 = $268;
    label = 71;
    break;
   }
   case 115:  {
    $269 = HEAP32[$6>>2]|0;
    $270 = ($269|0)!=(0|0);
    $271 = $270 ? $269 : 8994;
    $$1 = $271;
    label = 71;
    break;
   }
   case 67:  {
    $278 = $6;
    $279 = $278;
    $280 = HEAP32[$279>>2]|0;
    $281 = (($278) + 4)|0;
    $282 = $281;
    $283 = HEAP32[$282>>2]|0;
    HEAP32[$8>>2] = $280;
    HEAP32[$14>>2] = 0;
    HEAP32[$6>>2] = $8;
    $$4258355 = -1;$331 = $8;
    label = 75;
    break;
   }
   case 83:  {
    $$pre349 = HEAP32[$6>>2]|0;
    $284 = ($$0254|0)==(0);
    if ($284) {
     _pad_675($0,32,$$1260,0,$$1263$);
     $$0240$lcssa357 = 0;
     label = 84;
    } else {
     $$4258355 = $$0254;$331 = $$pre349;
     label = 75;
    }
    break;
   }
   case 65: case 71: case 70: case 69: case 97: case 103: case 102: case 101:  {
    $306 = +HEAPF64[$6>>3];
    $307 = (_fmt_fp($0,$306,$$1260,$$0254,$$1263$,$$0235)|0);
    $$0243 = $307;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
    continue L1;
    break;
   }
   default: {
    $$2 = $21;$$2234 = 0;$$2239 = 8984;$$2251 = $11;$$5 = $$0254;$$6268 = $$1263$;
   }
   }
  } while(0);
  L95: do {
   if ((label|0) == 61) {
    label = 0;
    $195 = $6;
    $196 = $195;
    $197 = HEAP32[$196>>2]|0;
    $198 = (($195) + 4)|0;
    $199 = $198;
    $200 = HEAP32[$199>>2]|0;
    $201 = $$1236 & 32;
    $202 = (_fmt_x($197,$200,$11,$201)|0);
    $203 = ($197|0)==(0);
    $204 = ($200|0)==(0);
    $205 = $203 & $204;
    $206 = $$3265 & 8;
    $207 = ($206|0)==(0);
    $or$cond283 = $207 | $205;
    $208 = $$1236 >> 4;
    $209 = (8984 + ($208)|0);
    $$289 = $or$cond283 ? 8984 : $209;
    $$290 = $or$cond283 ? 0 : 2;
    $$0228 = $202;$$1233 = $$290;$$1238 = $$289;$$2256 = $$1255;$$4266 = $$3265;$248 = $197;$250 = $200;
    label = 67;
   }
   else if ((label|0) == 66) {
    label = 0;
    $244 = (_fmt_u($242,$243,$11)|0);
    $$0228 = $244;$$1233 = $$0232;$$1238 = $$0237;$$2256 = $$0254;$$4266 = $$1263$;$248 = $242;$250 = $243;
    label = 67;
   }
   else if ((label|0) == 71) {
    label = 0;
    $272 = (_memchr($$1,0,$$0254)|0);
    $273 = ($272|0)==(0|0);
    $274 = $272;
    $275 = $$1;
    $276 = (($274) - ($275))|0;
    $277 = (($$1) + ($$0254)|0);
    $$3257 = $273 ? $$0254 : $276;
    $$1250 = $273 ? $277 : $272;
    $$2 = $$1;$$2234 = 0;$$2239 = 8984;$$2251 = $$1250;$$5 = $$3257;$$6268 = $164;
   }
   else if ((label|0) == 75) {
    label = 0;
    $$0229322 = $331;$$0240321 = 0;$$1244320 = 0;
    while(1) {
     $285 = HEAP32[$$0229322>>2]|0;
     $286 = ($285|0)==(0);
     if ($286) {
      $$0240$lcssa = $$0240321;$$2245 = $$1244320;
      break;
     }
     $287 = (_wctomb($9,$285)|0);
     $288 = ($287|0)<(0);
     $289 = (($$4258355) - ($$0240321))|0;
     $290 = ($287>>>0)>($289>>>0);
     $or$cond286 = $288 | $290;
     if ($or$cond286) {
      $$0240$lcssa = $$0240321;$$2245 = $287;
      break;
     }
     $291 = ((($$0229322)) + 4|0);
     $292 = (($287) + ($$0240321))|0;
     $293 = ($$4258355>>>0)>($292>>>0);
     if ($293) {
      $$0229322 = $291;$$0240321 = $292;$$1244320 = $287;
     } else {
      $$0240$lcssa = $292;$$2245 = $287;
      break;
     }
    }
    $294 = ($$2245|0)<(0);
    if ($294) {
     $$0 = -1;
     break L1;
    }
    _pad_675($0,32,$$1260,$$0240$lcssa,$$1263$);
    $295 = ($$0240$lcssa|0)==(0);
    if ($295) {
     $$0240$lcssa357 = 0;
     label = 84;
    } else {
     $$1230333 = $331;$$1241332 = 0;
     while(1) {
      $296 = HEAP32[$$1230333>>2]|0;
      $297 = ($296|0)==(0);
      if ($297) {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 84;
       break L95;
      }
      $298 = (_wctomb($9,$296)|0);
      $299 = (($298) + ($$1241332))|0;
      $300 = ($299|0)>($$0240$lcssa|0);
      if ($300) {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 84;
       break L95;
      }
      $301 = ((($$1230333)) + 4|0);
      _out_669($0,$9,$298);
      $302 = ($299>>>0)<($$0240$lcssa>>>0);
      if ($302) {
       $$1230333 = $301;$$1241332 = $299;
      } else {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 84;
       break;
      }
     }
    }
   }
  } while(0);
  if ((label|0) == 67) {
   label = 0;
   $245 = ($$2256|0)>(-1);
   $246 = $$4266 & -65537;
   $$$4266 = $245 ? $246 : $$4266;
   $247 = ($248|0)!=(0);
   $249 = ($250|0)!=(0);
   $251 = $247 | $249;
   $252 = ($$2256|0)!=(0);
   $or$cond = $252 | $251;
   $253 = $$0228;
   $254 = (($12) - ($253))|0;
   $255 = $251 ^ 1;
   $256 = $255&1;
   $257 = (($256) + ($254))|0;
   $258 = ($$2256|0)>($257|0);
   $$2256$ = $258 ? $$2256 : $257;
   $$2256$$$2256 = $or$cond ? $$2256$ : $$2256;
   $$0228$ = $or$cond ? $$0228 : $11;
   $$2 = $$0228$;$$2234 = $$1233;$$2239 = $$1238;$$2251 = $11;$$5 = $$2256$$$2256;$$6268 = $$$4266;
  }
  else if ((label|0) == 84) {
   label = 0;
   $303 = $$1263$ ^ 8192;
   _pad_675($0,32,$$1260,$$0240$lcssa357,$303);
   $304 = ($$1260|0)>($$0240$lcssa357|0);
   $305 = $304 ? $$1260 : $$0240$lcssa357;
   $$0243 = $305;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
   continue;
  }
  $308 = $$2251;
  $309 = $$2;
  $310 = (($308) - ($309))|0;
  $311 = ($$5|0)<($310|0);
  $$$5 = $311 ? $310 : $$5;
  $312 = (($$$5) + ($$2234))|0;
  $313 = ($$1260|0)<($312|0);
  $$2261 = $313 ? $312 : $$1260;
  _pad_675($0,32,$$2261,$312,$$6268);
  _out_669($0,$$2239,$$2234);
  $314 = $$6268 ^ 65536;
  _pad_675($0,48,$$2261,$312,$314);
  _pad_675($0,48,$$$5,$310,0);
  _out_669($0,$$2,$310);
  $315 = $$6268 ^ 8192;
  _pad_675($0,32,$$2261,$312,$315);
  $$0243 = $$2261;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
 }
 L114: do {
  if ((label|0) == 87) {
   $316 = ($0|0)==(0|0);
   if ($316) {
    $317 = ($$0269|0)==(0);
    if ($317) {
     $$0 = 0;
    } else {
     $$2242305 = 1;
     while(1) {
      $318 = (($4) + ($$2242305<<2)|0);
      $319 = HEAP32[$318>>2]|0;
      $320 = ($319|0)==(0);
      if ($320) {
       $$3303 = $$2242305;
       break;
      }
      $321 = (($3) + ($$2242305<<3)|0);
      _pop_arg_672($321,$319,$2);
      $322 = (($$2242305) + 1)|0;
      $323 = ($322|0)<(10);
      if ($323) {
       $$2242305 = $322;
      } else {
       $$0 = 1;
       break L114;
      }
     }
     while(1) {
      $326 = (($4) + ($$3303<<2)|0);
      $327 = HEAP32[$326>>2]|0;
      $328 = ($327|0)==(0);
      $325 = (($$3303) + 1)|0;
      if (!($328)) {
       $$0 = -1;
       break L114;
      }
      $324 = ($325|0)<(10);
      if ($324) {
       $$3303 = $325;
      } else {
       $$0 = 1;
       break;
      }
     }
    }
   } else {
    $$0 = $$1248;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function _out_669($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = $3 & 32;
 $5 = ($4|0)==(0);
 if ($5) {
  (___fwritex($1,$2,$0)|0);
 }
 return;
}
function _getint_670($0) {
 $0 = $0|0;
 var $$0$lcssa = 0, $$06 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $isdigit = 0, $isdigit5 = 0, $isdigittmp = 0, $isdigittmp4 = 0, $isdigittmp7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $isdigittmp4 = (($3) + -48)|0;
 $isdigit5 = ($isdigittmp4>>>0)<(10);
 if ($isdigit5) {
  $$06 = 0;$7 = $1;$isdigittmp7 = $isdigittmp4;
  while(1) {
   $4 = ($$06*10)|0;
   $5 = (($isdigittmp7) + ($4))|0;
   $6 = ((($7)) + 1|0);
   HEAP32[$0>>2] = $6;
   $8 = HEAP8[$6>>0]|0;
   $9 = $8 << 24 >> 24;
   $isdigittmp = (($9) + -48)|0;
   $isdigit = ($isdigittmp>>>0)<(10);
   if ($isdigit) {
    $$06 = $5;$7 = $6;$isdigittmp7 = $isdigittmp;
   } else {
    $$0$lcssa = $5;
    break;
   }
  }
 } else {
  $$0$lcssa = 0;
 }
 return ($$0$lcssa|0);
}
function _pop_arg_672($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$mask = 0, $$mask31 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current11 = 0, $arglist_current14 = 0, $arglist_current17 = 0;
 var $arglist_current2 = 0, $arglist_current20 = 0, $arglist_current23 = 0, $arglist_current26 = 0, $arglist_current5 = 0, $arglist_current8 = 0, $arglist_next = 0, $arglist_next12 = 0, $arglist_next15 = 0, $arglist_next18 = 0, $arglist_next21 = 0, $arglist_next24 = 0, $arglist_next27 = 0, $arglist_next3 = 0, $arglist_next6 = 0, $arglist_next9 = 0, $expanded = 0, $expanded28 = 0, $expanded30 = 0, $expanded31 = 0;
 var $expanded32 = 0, $expanded34 = 0, $expanded35 = 0, $expanded37 = 0, $expanded38 = 0, $expanded39 = 0, $expanded41 = 0, $expanded42 = 0, $expanded44 = 0, $expanded45 = 0, $expanded46 = 0, $expanded48 = 0, $expanded49 = 0, $expanded51 = 0, $expanded52 = 0, $expanded53 = 0, $expanded55 = 0, $expanded56 = 0, $expanded58 = 0, $expanded59 = 0;
 var $expanded60 = 0, $expanded62 = 0, $expanded63 = 0, $expanded65 = 0, $expanded66 = 0, $expanded67 = 0, $expanded69 = 0, $expanded70 = 0, $expanded72 = 0, $expanded73 = 0, $expanded74 = 0, $expanded76 = 0, $expanded77 = 0, $expanded79 = 0, $expanded80 = 0, $expanded81 = 0, $expanded83 = 0, $expanded84 = 0, $expanded86 = 0, $expanded87 = 0;
 var $expanded88 = 0, $expanded90 = 0, $expanded91 = 0, $expanded93 = 0, $expanded94 = 0, $expanded95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(20);
 L1: do {
  if (!($3)) {
   do {
    switch ($1|0) {
    case 9:  {
     $arglist_current = HEAP32[$2>>2]|0;
     $4 = $arglist_current;
     $5 = ((0) + 4|0);
     $expanded28 = $5;
     $expanded = (($expanded28) - 1)|0;
     $6 = (($4) + ($expanded))|0;
     $7 = ((0) + 4|0);
     $expanded32 = $7;
     $expanded31 = (($expanded32) - 1)|0;
     $expanded30 = $expanded31 ^ -1;
     $8 = $6 & $expanded30;
     $9 = $8;
     $10 = HEAP32[$9>>2]|0;
     $arglist_next = ((($9)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     HEAP32[$0>>2] = $10;
     break L1;
     break;
    }
    case 10:  {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $11 = $arglist_current2;
     $12 = ((0) + 4|0);
     $expanded35 = $12;
     $expanded34 = (($expanded35) - 1)|0;
     $13 = (($11) + ($expanded34))|0;
     $14 = ((0) + 4|0);
     $expanded39 = $14;
     $expanded38 = (($expanded39) - 1)|0;
     $expanded37 = $expanded38 ^ -1;
     $15 = $13 & $expanded37;
     $16 = $15;
     $17 = HEAP32[$16>>2]|0;
     $arglist_next3 = ((($16)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $18 = ($17|0)<(0);
     $19 = $18 << 31 >> 31;
     $20 = $0;
     $21 = $20;
     HEAP32[$21>>2] = $17;
     $22 = (($20) + 4)|0;
     $23 = $22;
     HEAP32[$23>>2] = $19;
     break L1;
     break;
    }
    case 11:  {
     $arglist_current5 = HEAP32[$2>>2]|0;
     $24 = $arglist_current5;
     $25 = ((0) + 4|0);
     $expanded42 = $25;
     $expanded41 = (($expanded42) - 1)|0;
     $26 = (($24) + ($expanded41))|0;
     $27 = ((0) + 4|0);
     $expanded46 = $27;
     $expanded45 = (($expanded46) - 1)|0;
     $expanded44 = $expanded45 ^ -1;
     $28 = $26 & $expanded44;
     $29 = $28;
     $30 = HEAP32[$29>>2]|0;
     $arglist_next6 = ((($29)) + 4|0);
     HEAP32[$2>>2] = $arglist_next6;
     $31 = $0;
     $32 = $31;
     HEAP32[$32>>2] = $30;
     $33 = (($31) + 4)|0;
     $34 = $33;
     HEAP32[$34>>2] = 0;
     break L1;
     break;
    }
    case 12:  {
     $arglist_current8 = HEAP32[$2>>2]|0;
     $35 = $arglist_current8;
     $36 = ((0) + 8|0);
     $expanded49 = $36;
     $expanded48 = (($expanded49) - 1)|0;
     $37 = (($35) + ($expanded48))|0;
     $38 = ((0) + 8|0);
     $expanded53 = $38;
     $expanded52 = (($expanded53) - 1)|0;
     $expanded51 = $expanded52 ^ -1;
     $39 = $37 & $expanded51;
     $40 = $39;
     $41 = $40;
     $42 = $41;
     $43 = HEAP32[$42>>2]|0;
     $44 = (($41) + 4)|0;
     $45 = $44;
     $46 = HEAP32[$45>>2]|0;
     $arglist_next9 = ((($40)) + 8|0);
     HEAP32[$2>>2] = $arglist_next9;
     $47 = $0;
     $48 = $47;
     HEAP32[$48>>2] = $43;
     $49 = (($47) + 4)|0;
     $50 = $49;
     HEAP32[$50>>2] = $46;
     break L1;
     break;
    }
    case 13:  {
     $arglist_current11 = HEAP32[$2>>2]|0;
     $51 = $arglist_current11;
     $52 = ((0) + 4|0);
     $expanded56 = $52;
     $expanded55 = (($expanded56) - 1)|0;
     $53 = (($51) + ($expanded55))|0;
     $54 = ((0) + 4|0);
     $expanded60 = $54;
     $expanded59 = (($expanded60) - 1)|0;
     $expanded58 = $expanded59 ^ -1;
     $55 = $53 & $expanded58;
     $56 = $55;
     $57 = HEAP32[$56>>2]|0;
     $arglist_next12 = ((($56)) + 4|0);
     HEAP32[$2>>2] = $arglist_next12;
     $58 = $57&65535;
     $59 = $58 << 16 >> 16;
     $60 = ($59|0)<(0);
     $61 = $60 << 31 >> 31;
     $62 = $0;
     $63 = $62;
     HEAP32[$63>>2] = $59;
     $64 = (($62) + 4)|0;
     $65 = $64;
     HEAP32[$65>>2] = $61;
     break L1;
     break;
    }
    case 14:  {
     $arglist_current14 = HEAP32[$2>>2]|0;
     $66 = $arglist_current14;
     $67 = ((0) + 4|0);
     $expanded63 = $67;
     $expanded62 = (($expanded63) - 1)|0;
     $68 = (($66) + ($expanded62))|0;
     $69 = ((0) + 4|0);
     $expanded67 = $69;
     $expanded66 = (($expanded67) - 1)|0;
     $expanded65 = $expanded66 ^ -1;
     $70 = $68 & $expanded65;
     $71 = $70;
     $72 = HEAP32[$71>>2]|0;
     $arglist_next15 = ((($71)) + 4|0);
     HEAP32[$2>>2] = $arglist_next15;
     $$mask31 = $72 & 65535;
     $73 = $0;
     $74 = $73;
     HEAP32[$74>>2] = $$mask31;
     $75 = (($73) + 4)|0;
     $76 = $75;
     HEAP32[$76>>2] = 0;
     break L1;
     break;
    }
    case 15:  {
     $arglist_current17 = HEAP32[$2>>2]|0;
     $77 = $arglist_current17;
     $78 = ((0) + 4|0);
     $expanded70 = $78;
     $expanded69 = (($expanded70) - 1)|0;
     $79 = (($77) + ($expanded69))|0;
     $80 = ((0) + 4|0);
     $expanded74 = $80;
     $expanded73 = (($expanded74) - 1)|0;
     $expanded72 = $expanded73 ^ -1;
     $81 = $79 & $expanded72;
     $82 = $81;
     $83 = HEAP32[$82>>2]|0;
     $arglist_next18 = ((($82)) + 4|0);
     HEAP32[$2>>2] = $arglist_next18;
     $84 = $83&255;
     $85 = $84 << 24 >> 24;
     $86 = ($85|0)<(0);
     $87 = $86 << 31 >> 31;
     $88 = $0;
     $89 = $88;
     HEAP32[$89>>2] = $85;
     $90 = (($88) + 4)|0;
     $91 = $90;
     HEAP32[$91>>2] = $87;
     break L1;
     break;
    }
    case 16:  {
     $arglist_current20 = HEAP32[$2>>2]|0;
     $92 = $arglist_current20;
     $93 = ((0) + 4|0);
     $expanded77 = $93;
     $expanded76 = (($expanded77) - 1)|0;
     $94 = (($92) + ($expanded76))|0;
     $95 = ((0) + 4|0);
     $expanded81 = $95;
     $expanded80 = (($expanded81) - 1)|0;
     $expanded79 = $expanded80 ^ -1;
     $96 = $94 & $expanded79;
     $97 = $96;
     $98 = HEAP32[$97>>2]|0;
     $arglist_next21 = ((($97)) + 4|0);
     HEAP32[$2>>2] = $arglist_next21;
     $$mask = $98 & 255;
     $99 = $0;
     $100 = $99;
     HEAP32[$100>>2] = $$mask;
     $101 = (($99) + 4)|0;
     $102 = $101;
     HEAP32[$102>>2] = 0;
     break L1;
     break;
    }
    case 17:  {
     $arglist_current23 = HEAP32[$2>>2]|0;
     $103 = $arglist_current23;
     $104 = ((0) + 8|0);
     $expanded84 = $104;
     $expanded83 = (($expanded84) - 1)|0;
     $105 = (($103) + ($expanded83))|0;
     $106 = ((0) + 8|0);
     $expanded88 = $106;
     $expanded87 = (($expanded88) - 1)|0;
     $expanded86 = $expanded87 ^ -1;
     $107 = $105 & $expanded86;
     $108 = $107;
     $109 = +HEAPF64[$108>>3];
     $arglist_next24 = ((($108)) + 8|0);
     HEAP32[$2>>2] = $arglist_next24;
     HEAPF64[$0>>3] = $109;
     break L1;
     break;
    }
    case 18:  {
     $arglist_current26 = HEAP32[$2>>2]|0;
     $110 = $arglist_current26;
     $111 = ((0) + 8|0);
     $expanded91 = $111;
     $expanded90 = (($expanded91) - 1)|0;
     $112 = (($110) + ($expanded90))|0;
     $113 = ((0) + 8|0);
     $expanded95 = $113;
     $expanded94 = (($expanded95) - 1)|0;
     $expanded93 = $expanded94 ^ -1;
     $114 = $112 & $expanded93;
     $115 = $114;
     $116 = +HEAPF64[$115>>3];
     $arglist_next27 = ((($115)) + 8|0);
     HEAP32[$2>>2] = $arglist_next27;
     HEAPF64[$0>>3] = $116;
     break L1;
     break;
    }
    default: {
     break L1;
    }
    }
   } while(0);
  }
 } while(0);
 return;
}
function _fmt_x($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$05$lcssa = 0, $$056 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $4 = ($0|0)==(0);
 $5 = ($1|0)==(0);
 $6 = $4 & $5;
 if ($6) {
  $$05$lcssa = $2;
 } else {
  $$056 = $2;$15 = $1;$8 = $0;
  while(1) {
   $7 = $8 & 15;
   $9 = (9036 + ($7)|0);
   $10 = HEAP8[$9>>0]|0;
   $11 = $10&255;
   $12 = $11 | $3;
   $13 = $12&255;
   $14 = ((($$056)) + -1|0);
   HEAP8[$14>>0] = $13;
   $16 = (_bitshift64Lshr(($8|0),($15|0),4)|0);
   $17 = tempRet0;
   $18 = ($16|0)==(0);
   $19 = ($17|0)==(0);
   $20 = $18 & $19;
   if ($20) {
    $$05$lcssa = $14;
    break;
   } else {
    $$056 = $14;$15 = $17;$8 = $16;
   }
  }
 }
 return ($$05$lcssa|0);
}
function _fmt_o($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0);
 $4 = ($1|0)==(0);
 $5 = $3 & $4;
 if ($5) {
  $$0$lcssa = $2;
 } else {
  $$06 = $2;$11 = $1;$7 = $0;
  while(1) {
   $6 = $7&255;
   $8 = $6 & 7;
   $9 = $8 | 48;
   $10 = ((($$06)) + -1|0);
   HEAP8[$10>>0] = $9;
   $12 = (_bitshift64Lshr(($7|0),($11|0),3)|0);
   $13 = tempRet0;
   $14 = ($12|0)==(0);
   $15 = ($13|0)==(0);
   $16 = $14 & $15;
   if ($16) {
    $$0$lcssa = $10;
    break;
   } else {
    $$06 = $10;$11 = $13;$7 = $12;
   }
  }
 }
 return ($$0$lcssa|0);
}
function _fmt_u($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(0);
 $4 = ($0>>>0)>(4294967295);
 $5 = ($1|0)==(0);
 $6 = $5 & $4;
 $7 = $3 | $6;
 if ($7) {
  $$0914 = $2;$8 = $0;$9 = $1;
  while(1) {
   $10 = (___uremdi3(($8|0),($9|0),10,0)|0);
   $11 = tempRet0;
   $12 = $10&255;
   $13 = $12 | 48;
   $14 = ((($$0914)) + -1|0);
   HEAP8[$14>>0] = $13;
   $15 = (___udivdi3(($8|0),($9|0),10,0)|0);
   $16 = tempRet0;
   $17 = ($9>>>0)>(9);
   $18 = ($8>>>0)>(4294967295);
   $19 = ($9|0)==(9);
   $20 = $19 & $18;
   $21 = $17 | $20;
   if ($21) {
    $$0914 = $14;$8 = $15;$9 = $16;
   } else {
    break;
   }
  }
  $$010$lcssa$off0 = $15;$$09$lcssa = $14;
 } else {
  $$010$lcssa$off0 = $0;$$09$lcssa = $2;
 }
 $22 = ($$010$lcssa$off0|0)==(0);
 if ($22) {
  $$1$lcssa = $$09$lcssa;
 } else {
  $$012 = $$010$lcssa$off0;$$111 = $$09$lcssa;
  while(1) {
   $23 = (($$012>>>0) % 10)&-1;
   $24 = $23 | 48;
   $25 = $24&255;
   $26 = ((($$111)) + -1|0);
   HEAP8[$26>>0] = $25;
   $27 = (($$012>>>0) / 10)&-1;
   $28 = ($$012>>>0)<(10);
   if ($28) {
    $$1$lcssa = $26;
    break;
   } else {
    $$012 = $27;$$111 = $26;
   }
  }
 }
 return ($$1$lcssa|0);
}
function _strerror($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (___pthread_self_86()|0);
 $2 = ((($1)) + 188|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = (___strerror_l($0,$3)|0);
 return ($4|0);
}
function _pad_675($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0$lcssa = 0, $$011 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(256|0);
 $5 = sp;
 $6 = $4 & 73728;
 $7 = ($6|0)==(0);
 $8 = ($2|0)>($3|0);
 $or$cond = $8 & $7;
 if ($or$cond) {
  $9 = (($2) - ($3))|0;
  $10 = ($9>>>0)<(256);
  $11 = $10 ? $9 : 256;
  _memset(($5|0),($1|0),($11|0))|0;
  $12 = ($9>>>0)>(255);
  if ($12) {
   $13 = (($2) - ($3))|0;
   $$011 = $9;
   while(1) {
    _out_669($0,$5,256);
    $14 = (($$011) + -256)|0;
    $15 = ($14>>>0)>(255);
    if ($15) {
     $$011 = $14;
    } else {
     break;
    }
   }
   $16 = $13 & 255;
   $$0$lcssa = $16;
  } else {
   $$0$lcssa = $9;
  }
  _out_669($0,$5,$$0$lcssa);
 }
 STACKTOP = sp;return;
}
function _wctomb($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = (_wcrtomb($0,$1,0)|0);
  $$0 = $3;
 }
 return ($$0|0);
}
function _fmt_fp($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = +$1;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$ = 0, $$$ = 0, $$$$559 = 0.0, $$$3484 = 0, $$$3484691 = 0, $$$3484692 = 0, $$$3501 = 0, $$$4502 = 0, $$$542 = 0.0, $$$559 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463584 = 0, $$0464594 = 0, $$0471 = 0.0, $$0479 = 0, $$0487642 = 0, $$0488 = 0, $$0488653 = 0, $$0488655 = 0;
 var $$0496$$9 = 0, $$0497654 = 0, $$0498 = 0, $$0509582 = 0.0, $$0510 = 0, $$0511 = 0, $$0514637 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0525 = 0, $$0527 = 0, $$0527629 = 0, $$0527631 = 0, $$0530636 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0;
 var $$1480 = 0, $$1482$lcssa = 0, $$1482661 = 0, $$1489641 = 0, $$1499$lcssa = 0, $$1499660 = 0, $$1508583 = 0, $$1512$lcssa = 0, $$1512607 = 0, $$1515 = 0, $$1524 = 0, $$1526 = 0, $$1528614 = 0, $$1531$lcssa = 0, $$1531630 = 0, $$1598 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2476$$547 = 0;
 var $$2476$$549 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516618 = 0, $$2529 = 0, $$2532617 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484648 = 0, $$3501$lcssa = 0, $$3501647 = 0, $$3533613 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478590 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0;
 var $$5$lcssa = 0, $$534$ = 0, $$539 = 0, $$539$ = 0, $$542 = 0.0, $$546 = 0, $$548 = 0, $$5486$lcssa = 0, $$5486623 = 0, $$5493597 = 0, $$5519$ph = 0, $$555 = 0, $$556 = 0, $$559 = 0.0, $$5602 = 0, $$6 = 0, $$6494589 = 0, $$7495601 = 0, $$7505 = 0, $$7505$ = 0;
 var $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa673 = 0, $$neg = 0, $$neg567 = 0, $$pn = 0, $$pn566 = 0, $$pr = 0, $$pr564 = 0, $$pre = 0, $$pre$phi690Z2D = 0, $$pre689 = 0, $$sink545$lcssa = 0, $$sink545622 = 0, $$sink562 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0;
 var $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0.0, $117 = 0.0, $118 = 0.0, $119 = 0, $12 = 0, $120 = 0;
 var $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0;
 var $14 = 0.0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0;
 var $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0;
 var $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0;
 var $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0;
 var $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0.0, $229 = 0.0, $23 = 0;
 var $230 = 0, $231 = 0.0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0;
 var $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0;
 var $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0;
 var $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0;
 var $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0;
 var $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0;
 var $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0.0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0;
 var $358 = 0, $359 = 0, $36 = 0.0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0;
 var $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0.0, $52 = 0, $53 = 0, $54 = 0, $55 = 0.0, $56 = 0.0, $57 = 0.0, $58 = 0.0, $59 = 0.0, $6 = 0, $60 = 0.0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0.0, $88 = 0.0, $89 = 0.0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $exitcond = 0;
 var $narrow = 0, $not$ = 0, $notlhs = 0, $notrhs = 0, $or$cond = 0, $or$cond3$not = 0, $or$cond537 = 0, $or$cond541 = 0, $or$cond544 = 0, $or$cond554 = 0, $or$cond6 = 0, $scevgep684 = 0, $scevgep684685 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 560|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(560|0);
 $6 = sp + 8|0;
 $7 = sp;
 $8 = sp + 524|0;
 $9 = $8;
 $10 = sp + 512|0;
 HEAP32[$7>>2] = 0;
 $11 = ((($10)) + 12|0);
 (___DOUBLE_BITS_676($1)|0);
 $12 = tempRet0;
 $13 = ($12|0)<(0);
 if ($13) {
  $14 = -$1;
  $$0471 = $14;$$0520 = 1;$$0521 = 9001;
 } else {
  $15 = $4 & 2048;
  $16 = ($15|0)==(0);
  $17 = $4 & 1;
  $18 = ($17|0)==(0);
  $$ = $18 ? (9002) : (9007);
  $$$ = $16 ? $$ : (9004);
  $19 = $4 & 2049;
  $narrow = ($19|0)!=(0);
  $$534$ = $narrow&1;
  $$0471 = $1;$$0520 = $$534$;$$0521 = $$$;
 }
 (___DOUBLE_BITS_676($$0471)|0);
 $20 = tempRet0;
 $21 = $20 & 2146435072;
 $22 = ($21>>>0)<(2146435072);
 $23 = (0)<(0);
 $24 = ($21|0)==(2146435072);
 $25 = $24 & $23;
 $26 = $22 | $25;
 do {
  if ($26) {
   $35 = (+_frexpl($$0471,$7));
   $36 = $35 * 2.0;
   $37 = $36 != 0.0;
   if ($37) {
    $38 = HEAP32[$7>>2]|0;
    $39 = (($38) + -1)|0;
    HEAP32[$7>>2] = $39;
   }
   $40 = $5 | 32;
   $41 = ($40|0)==(97);
   if ($41) {
    $42 = $5 & 32;
    $43 = ($42|0)==(0);
    $44 = ((($$0521)) + 9|0);
    $$0521$ = $43 ? $$0521 : $44;
    $45 = $$0520 | 2;
    $46 = ($3>>>0)>(11);
    $47 = (12 - ($3))|0;
    $48 = ($47|0)==(0);
    $49 = $46 | $48;
    do {
     if ($49) {
      $$1472 = $36;
     } else {
      $$0509582 = 8.0;$$1508583 = $47;
      while(1) {
       $50 = (($$1508583) + -1)|0;
       $51 = $$0509582 * 16.0;
       $52 = ($50|0)==(0);
       if ($52) {
        break;
       } else {
        $$0509582 = $51;$$1508583 = $50;
       }
      }
      $53 = HEAP8[$$0521$>>0]|0;
      $54 = ($53<<24>>24)==(45);
      if ($54) {
       $55 = -$36;
       $56 = $55 - $51;
       $57 = $51 + $56;
       $58 = -$57;
       $$1472 = $58;
       break;
      } else {
       $59 = $36 + $51;
       $60 = $59 - $51;
       $$1472 = $60;
       break;
      }
     }
    } while(0);
    $61 = HEAP32[$7>>2]|0;
    $62 = ($61|0)<(0);
    $63 = (0 - ($61))|0;
    $64 = $62 ? $63 : $61;
    $65 = ($64|0)<(0);
    $66 = $65 << 31 >> 31;
    $67 = (_fmt_u($64,$66,$11)|0);
    $68 = ($67|0)==($11|0);
    if ($68) {
     $69 = ((($10)) + 11|0);
     HEAP8[$69>>0] = 48;
     $$0511 = $69;
    } else {
     $$0511 = $67;
    }
    $70 = $61 >> 31;
    $71 = $70 & 2;
    $72 = (($71) + 43)|0;
    $73 = $72&255;
    $74 = ((($$0511)) + -1|0);
    HEAP8[$74>>0] = $73;
    $75 = (($5) + 15)|0;
    $76 = $75&255;
    $77 = ((($$0511)) + -2|0);
    HEAP8[$77>>0] = $76;
    $notrhs = ($3|0)<(1);
    $78 = $4 & 8;
    $79 = ($78|0)==(0);
    $$0523 = $8;$$2473 = $$1472;
    while(1) {
     $80 = (~~(($$2473)));
     $81 = (9036 + ($80)|0);
     $82 = HEAP8[$81>>0]|0;
     $83 = $82&255;
     $84 = $83 | $42;
     $85 = $84&255;
     $86 = ((($$0523)) + 1|0);
     HEAP8[$$0523>>0] = $85;
     $87 = (+($80|0));
     $88 = $$2473 - $87;
     $89 = $88 * 16.0;
     $90 = $86;
     $91 = (($90) - ($9))|0;
     $92 = ($91|0)==(1);
     if ($92) {
      $notlhs = $89 == 0.0;
      $or$cond3$not = $notrhs & $notlhs;
      $or$cond = $79 & $or$cond3$not;
      if ($or$cond) {
       $$1524 = $86;
      } else {
       $93 = ((($$0523)) + 2|0);
       HEAP8[$86>>0] = 46;
       $$1524 = $93;
      }
     } else {
      $$1524 = $86;
     }
     $94 = $89 != 0.0;
     if ($94) {
      $$0523 = $$1524;$$2473 = $89;
     } else {
      break;
     }
    }
    $95 = ($3|0)!=(0);
    $96 = $77;
    $97 = $11;
    $98 = $$1524;
    $99 = (($98) - ($9))|0;
    $100 = (($97) - ($96))|0;
    $101 = (($99) + -2)|0;
    $102 = ($101|0)<($3|0);
    $or$cond537 = $95 & $102;
    $103 = (($3) + 2)|0;
    $$pn = $or$cond537 ? $103 : $99;
    $$0525 = (($100) + ($45))|0;
    $104 = (($$0525) + ($$pn))|0;
    _pad_675($0,32,$2,$104,$4);
    _out_669($0,$$0521$,$45);
    $105 = $4 ^ 65536;
    _pad_675($0,48,$2,$104,$105);
    _out_669($0,$8,$99);
    $106 = (($$pn) - ($99))|0;
    _pad_675($0,48,$106,0,0);
    _out_669($0,$77,$100);
    $107 = $4 ^ 8192;
    _pad_675($0,32,$2,$104,$107);
    $$sink562 = $104;
    break;
   }
   $108 = ($3|0)<(0);
   $$539 = $108 ? 6 : $3;
   if ($37) {
    $109 = $36 * 268435456.0;
    $110 = HEAP32[$7>>2]|0;
    $111 = (($110) + -28)|0;
    HEAP32[$7>>2] = $111;
    $$3 = $109;$$pr = $111;
   } else {
    $$pre = HEAP32[$7>>2]|0;
    $$3 = $36;$$pr = $$pre;
   }
   $112 = ($$pr|0)<(0);
   $113 = ((($6)) + 288|0);
   $$556 = $112 ? $6 : $113;
   $$0498 = $$556;$$4 = $$3;
   while(1) {
    $114 = (~~(($$4))>>>0);
    HEAP32[$$0498>>2] = $114;
    $115 = ((($$0498)) + 4|0);
    $116 = (+($114>>>0));
    $117 = $$4 - $116;
    $118 = $117 * 1.0E+9;
    $119 = $118 != 0.0;
    if ($119) {
     $$0498 = $115;$$4 = $118;
    } else {
     break;
    }
   }
   $120 = ($$pr|0)>(0);
   if ($120) {
    $$1482661 = $$556;$$1499660 = $115;$122 = $$pr;
    while(1) {
     $121 = ($122|0)<(29);
     $123 = $121 ? $122 : 29;
     $$0488653 = ((($$1499660)) + -4|0);
     $124 = ($$0488653>>>0)<($$1482661>>>0);
     if ($124) {
      $$2483$ph = $$1482661;
     } else {
      $$0488655 = $$0488653;$$0497654 = 0;
      while(1) {
       $125 = HEAP32[$$0488655>>2]|0;
       $126 = (_bitshift64Shl(($125|0),0,($123|0))|0);
       $127 = tempRet0;
       $128 = (_i64Add(($126|0),($127|0),($$0497654|0),0)|0);
       $129 = tempRet0;
       $130 = (___uremdi3(($128|0),($129|0),1000000000,0)|0);
       $131 = tempRet0;
       HEAP32[$$0488655>>2] = $130;
       $132 = (___udivdi3(($128|0),($129|0),1000000000,0)|0);
       $133 = tempRet0;
       $$0488 = ((($$0488655)) + -4|0);
       $134 = ($$0488>>>0)<($$1482661>>>0);
       if ($134) {
        break;
       } else {
        $$0488655 = $$0488;$$0497654 = $132;
       }
      }
      $135 = ($132|0)==(0);
      if ($135) {
       $$2483$ph = $$1482661;
      } else {
       $136 = ((($$1482661)) + -4|0);
       HEAP32[$136>>2] = $132;
       $$2483$ph = $136;
      }
     }
     $$2500 = $$1499660;
     while(1) {
      $137 = ($$2500>>>0)>($$2483$ph>>>0);
      if (!($137)) {
       break;
      }
      $138 = ((($$2500)) + -4|0);
      $139 = HEAP32[$138>>2]|0;
      $140 = ($139|0)==(0);
      if ($140) {
       $$2500 = $138;
      } else {
       break;
      }
     }
     $141 = HEAP32[$7>>2]|0;
     $142 = (($141) - ($123))|0;
     HEAP32[$7>>2] = $142;
     $143 = ($142|0)>(0);
     if ($143) {
      $$1482661 = $$2483$ph;$$1499660 = $$2500;$122 = $142;
     } else {
      $$1482$lcssa = $$2483$ph;$$1499$lcssa = $$2500;$$pr564 = $142;
      break;
     }
    }
   } else {
    $$1482$lcssa = $$556;$$1499$lcssa = $115;$$pr564 = $$pr;
   }
   $144 = ($$pr564|0)<(0);
   if ($144) {
    $145 = (($$539) + 25)|0;
    $146 = (($145|0) / 9)&-1;
    $147 = (($146) + 1)|0;
    $148 = ($40|0)==(102);
    $$3484648 = $$1482$lcssa;$$3501647 = $$1499$lcssa;$150 = $$pr564;
    while(1) {
     $149 = (0 - ($150))|0;
     $151 = ($149|0)<(9);
     $152 = $151 ? $149 : 9;
     $153 = ($$3484648>>>0)<($$3501647>>>0);
     if ($153) {
      $157 = 1 << $152;
      $158 = (($157) + -1)|0;
      $159 = 1000000000 >>> $152;
      $$0487642 = 0;$$1489641 = $$3484648;
      while(1) {
       $160 = HEAP32[$$1489641>>2]|0;
       $161 = $160 & $158;
       $162 = $160 >>> $152;
       $163 = (($162) + ($$0487642))|0;
       HEAP32[$$1489641>>2] = $163;
       $164 = Math_imul($161, $159)|0;
       $165 = ((($$1489641)) + 4|0);
       $166 = ($165>>>0)<($$3501647>>>0);
       if ($166) {
        $$0487642 = $164;$$1489641 = $165;
       } else {
        break;
       }
      }
      $167 = HEAP32[$$3484648>>2]|0;
      $168 = ($167|0)==(0);
      $169 = ((($$3484648)) + 4|0);
      $$$3484 = $168 ? $169 : $$3484648;
      $170 = ($164|0)==(0);
      if ($170) {
       $$$3484692 = $$$3484;$$4502 = $$3501647;
      } else {
       $171 = ((($$3501647)) + 4|0);
       HEAP32[$$3501647>>2] = $164;
       $$$3484692 = $$$3484;$$4502 = $171;
      }
     } else {
      $154 = HEAP32[$$3484648>>2]|0;
      $155 = ($154|0)==(0);
      $156 = ((($$3484648)) + 4|0);
      $$$3484691 = $155 ? $156 : $$3484648;
      $$$3484692 = $$$3484691;$$4502 = $$3501647;
     }
     $172 = $148 ? $$556 : $$$3484692;
     $173 = $$4502;
     $174 = $172;
     $175 = (($173) - ($174))|0;
     $176 = $175 >> 2;
     $177 = ($176|0)>($147|0);
     $178 = (($172) + ($147<<2)|0);
     $$$4502 = $177 ? $178 : $$4502;
     $179 = HEAP32[$7>>2]|0;
     $180 = (($179) + ($152))|0;
     HEAP32[$7>>2] = $180;
     $181 = ($180|0)<(0);
     if ($181) {
      $$3484648 = $$$3484692;$$3501647 = $$$4502;$150 = $180;
     } else {
      $$3484$lcssa = $$$3484692;$$3501$lcssa = $$$4502;
      break;
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa;$$3501$lcssa = $$1499$lcssa;
   }
   $182 = ($$3484$lcssa>>>0)<($$3501$lcssa>>>0);
   $183 = $$556;
   if ($182) {
    $184 = $$3484$lcssa;
    $185 = (($183) - ($184))|0;
    $186 = $185 >> 2;
    $187 = ($186*9)|0;
    $188 = HEAP32[$$3484$lcssa>>2]|0;
    $189 = ($188>>>0)<(10);
    if ($189) {
     $$1515 = $187;
    } else {
     $$0514637 = $187;$$0530636 = 10;
     while(1) {
      $190 = ($$0530636*10)|0;
      $191 = (($$0514637) + 1)|0;
      $192 = ($188>>>0)<($190>>>0);
      if ($192) {
       $$1515 = $191;
       break;
      } else {
       $$0514637 = $191;$$0530636 = $190;
      }
     }
    }
   } else {
    $$1515 = 0;
   }
   $193 = ($40|0)!=(102);
   $194 = $193 ? $$1515 : 0;
   $195 = (($$539) - ($194))|0;
   $196 = ($40|0)==(103);
   $197 = ($$539|0)!=(0);
   $198 = $197 & $196;
   $$neg = $198 << 31 >> 31;
   $199 = (($195) + ($$neg))|0;
   $200 = $$3501$lcssa;
   $201 = (($200) - ($183))|0;
   $202 = $201 >> 2;
   $203 = ($202*9)|0;
   $204 = (($203) + -9)|0;
   $205 = ($199|0)<($204|0);
   if ($205) {
    $206 = ((($$556)) + 4|0);
    $207 = (($199) + 9216)|0;
    $208 = (($207|0) / 9)&-1;
    $209 = (($208) + -1024)|0;
    $210 = (($206) + ($209<<2)|0);
    $211 = (($207|0) % 9)&-1;
    $$0527629 = (($211) + 1)|0;
    $212 = ($$0527629|0)<(9);
    if ($212) {
     $$0527631 = $$0527629;$$1531630 = 10;
     while(1) {
      $213 = ($$1531630*10)|0;
      $$0527 = (($$0527631) + 1)|0;
      $exitcond = ($$0527|0)==(9);
      if ($exitcond) {
       $$1531$lcssa = $213;
       break;
      } else {
       $$0527631 = $$0527;$$1531630 = $213;
      }
     }
    } else {
     $$1531$lcssa = 10;
    }
    $214 = HEAP32[$210>>2]|0;
    $215 = (($214>>>0) % ($$1531$lcssa>>>0))&-1;
    $216 = ($215|0)==(0);
    $217 = ((($210)) + 4|0);
    $218 = ($217|0)==($$3501$lcssa|0);
    $or$cond541 = $218 & $216;
    if ($or$cond541) {
     $$4492 = $210;$$4518 = $$1515;$$8 = $$3484$lcssa;
    } else {
     $219 = (($214>>>0) / ($$1531$lcssa>>>0))&-1;
     $220 = $219 & 1;
     $221 = ($220|0)==(0);
     $$542 = $221 ? 9007199254740992.0 : 9007199254740994.0;
     $222 = (($$1531$lcssa|0) / 2)&-1;
     $223 = ($215>>>0)<($222>>>0);
     $224 = ($215|0)==($222|0);
     $or$cond544 = $218 & $224;
     $$559 = $or$cond544 ? 1.0 : 1.5;
     $$$559 = $223 ? 0.5 : $$559;
     $225 = ($$0520|0)==(0);
     if ($225) {
      $$1467 = $$$559;$$1469 = $$542;
     } else {
      $226 = HEAP8[$$0521>>0]|0;
      $227 = ($226<<24>>24)==(45);
      $228 = -$$542;
      $229 = -$$$559;
      $$$542 = $227 ? $228 : $$542;
      $$$$559 = $227 ? $229 : $$$559;
      $$1467 = $$$$559;$$1469 = $$$542;
     }
     $230 = (($214) - ($215))|0;
     HEAP32[$210>>2] = $230;
     $231 = $$1469 + $$1467;
     $232 = $231 != $$1469;
     if ($232) {
      $233 = (($230) + ($$1531$lcssa))|0;
      HEAP32[$210>>2] = $233;
      $234 = ($233>>>0)>(999999999);
      if ($234) {
       $$5486623 = $$3484$lcssa;$$sink545622 = $210;
       while(1) {
        $235 = ((($$sink545622)) + -4|0);
        HEAP32[$$sink545622>>2] = 0;
        $236 = ($235>>>0)<($$5486623>>>0);
        if ($236) {
         $237 = ((($$5486623)) + -4|0);
         HEAP32[$237>>2] = 0;
         $$6 = $237;
        } else {
         $$6 = $$5486623;
        }
        $238 = HEAP32[$235>>2]|0;
        $239 = (($238) + 1)|0;
        HEAP32[$235>>2] = $239;
        $240 = ($239>>>0)>(999999999);
        if ($240) {
         $$5486623 = $$6;$$sink545622 = $235;
        } else {
         $$5486$lcssa = $$6;$$sink545$lcssa = $235;
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa;$$sink545$lcssa = $210;
      }
      $241 = $$5486$lcssa;
      $242 = (($183) - ($241))|0;
      $243 = $242 >> 2;
      $244 = ($243*9)|0;
      $245 = HEAP32[$$5486$lcssa>>2]|0;
      $246 = ($245>>>0)<(10);
      if ($246) {
       $$4492 = $$sink545$lcssa;$$4518 = $244;$$8 = $$5486$lcssa;
      } else {
       $$2516618 = $244;$$2532617 = 10;
       while(1) {
        $247 = ($$2532617*10)|0;
        $248 = (($$2516618) + 1)|0;
        $249 = ($245>>>0)<($247>>>0);
        if ($249) {
         $$4492 = $$sink545$lcssa;$$4518 = $248;$$8 = $$5486$lcssa;
         break;
        } else {
         $$2516618 = $248;$$2532617 = $247;
        }
       }
      }
     } else {
      $$4492 = $210;$$4518 = $$1515;$$8 = $$3484$lcssa;
     }
    }
    $250 = ((($$4492)) + 4|0);
    $251 = ($$3501$lcssa>>>0)>($250>>>0);
    $$$3501 = $251 ? $250 : $$3501$lcssa;
    $$5519$ph = $$4518;$$7505$ph = $$$3501;$$9$ph = $$8;
   } else {
    $$5519$ph = $$1515;$$7505$ph = $$3501$lcssa;$$9$ph = $$3484$lcssa;
   }
   $$7505 = $$7505$ph;
   while(1) {
    $252 = ($$7505>>>0)>($$9$ph>>>0);
    if (!($252)) {
     $$lcssa673 = 0;
     break;
    }
    $253 = ((($$7505)) + -4|0);
    $254 = HEAP32[$253>>2]|0;
    $255 = ($254|0)==(0);
    if ($255) {
     $$7505 = $253;
    } else {
     $$lcssa673 = 1;
     break;
    }
   }
   $256 = (0 - ($$5519$ph))|0;
   do {
    if ($196) {
     $not$ = $197 ^ 1;
     $257 = $not$&1;
     $$539$ = (($257) + ($$539))|0;
     $258 = ($$539$|0)>($$5519$ph|0);
     $259 = ($$5519$ph|0)>(-5);
     $or$cond6 = $258 & $259;
     if ($or$cond6) {
      $260 = (($5) + -1)|0;
      $$neg567 = (($$539$) + -1)|0;
      $261 = (($$neg567) - ($$5519$ph))|0;
      $$0479 = $260;$$2476 = $261;
     } else {
      $262 = (($5) + -2)|0;
      $263 = (($$539$) + -1)|0;
      $$0479 = $262;$$2476 = $263;
     }
     $264 = $4 & 8;
     $265 = ($264|0)==(0);
     if ($265) {
      if ($$lcssa673) {
       $266 = ((($$7505)) + -4|0);
       $267 = HEAP32[$266>>2]|0;
       $268 = ($267|0)==(0);
       if ($268) {
        $$2529 = 9;
       } else {
        $269 = (($267>>>0) % 10)&-1;
        $270 = ($269|0)==(0);
        if ($270) {
         $$1528614 = 0;$$3533613 = 10;
         while(1) {
          $271 = ($$3533613*10)|0;
          $272 = (($$1528614) + 1)|0;
          $273 = (($267>>>0) % ($271>>>0))&-1;
          $274 = ($273|0)==(0);
          if ($274) {
           $$1528614 = $272;$$3533613 = $271;
          } else {
           $$2529 = $272;
           break;
          }
         }
        } else {
         $$2529 = 0;
        }
       }
      } else {
       $$2529 = 9;
      }
      $275 = $$0479 | 32;
      $276 = ($275|0)==(102);
      $277 = $$7505;
      $278 = (($277) - ($183))|0;
      $279 = $278 >> 2;
      $280 = ($279*9)|0;
      $281 = (($280) + -9)|0;
      if ($276) {
       $282 = (($281) - ($$2529))|0;
       $283 = ($282|0)>(0);
       $$546 = $283 ? $282 : 0;
       $284 = ($$2476|0)<($$546|0);
       $$2476$$547 = $284 ? $$2476 : $$546;
       $$1480 = $$0479;$$3477 = $$2476$$547;$$pre$phi690Z2D = 0;
       break;
      } else {
       $285 = (($281) + ($$5519$ph))|0;
       $286 = (($285) - ($$2529))|0;
       $287 = ($286|0)>(0);
       $$548 = $287 ? $286 : 0;
       $288 = ($$2476|0)<($$548|0);
       $$2476$$549 = $288 ? $$2476 : $$548;
       $$1480 = $$0479;$$3477 = $$2476$$549;$$pre$phi690Z2D = 0;
       break;
      }
     } else {
      $$1480 = $$0479;$$3477 = $$2476;$$pre$phi690Z2D = $264;
     }
    } else {
     $$pre689 = $4 & 8;
     $$1480 = $5;$$3477 = $$539;$$pre$phi690Z2D = $$pre689;
    }
   } while(0);
   $289 = $$3477 | $$pre$phi690Z2D;
   $290 = ($289|0)!=(0);
   $291 = $290&1;
   $292 = $$1480 | 32;
   $293 = ($292|0)==(102);
   if ($293) {
    $294 = ($$5519$ph|0)>(0);
    $295 = $294 ? $$5519$ph : 0;
    $$2513 = 0;$$pn566 = $295;
   } else {
    $296 = ($$5519$ph|0)<(0);
    $297 = $296 ? $256 : $$5519$ph;
    $298 = ($297|0)<(0);
    $299 = $298 << 31 >> 31;
    $300 = (_fmt_u($297,$299,$11)|0);
    $301 = $11;
    $302 = $300;
    $303 = (($301) - ($302))|0;
    $304 = ($303|0)<(2);
    if ($304) {
     $$1512607 = $300;
     while(1) {
      $305 = ((($$1512607)) + -1|0);
      HEAP8[$305>>0] = 48;
      $306 = $305;
      $307 = (($301) - ($306))|0;
      $308 = ($307|0)<(2);
      if ($308) {
       $$1512607 = $305;
      } else {
       $$1512$lcssa = $305;
       break;
      }
     }
    } else {
     $$1512$lcssa = $300;
    }
    $309 = $$5519$ph >> 31;
    $310 = $309 & 2;
    $311 = (($310) + 43)|0;
    $312 = $311&255;
    $313 = ((($$1512$lcssa)) + -1|0);
    HEAP8[$313>>0] = $312;
    $314 = $$1480&255;
    $315 = ((($$1512$lcssa)) + -2|0);
    HEAP8[$315>>0] = $314;
    $316 = $315;
    $317 = (($301) - ($316))|0;
    $$2513 = $315;$$pn566 = $317;
   }
   $318 = (($$0520) + 1)|0;
   $319 = (($318) + ($$3477))|0;
   $$1526 = (($319) + ($291))|0;
   $320 = (($$1526) + ($$pn566))|0;
   _pad_675($0,32,$2,$320,$4);
   _out_669($0,$$0521,$$0520);
   $321 = $4 ^ 65536;
   _pad_675($0,48,$2,$320,$321);
   if ($293) {
    $322 = ($$9$ph>>>0)>($$556>>>0);
    $$0496$$9 = $322 ? $$556 : $$9$ph;
    $323 = ((($8)) + 9|0);
    $324 = $323;
    $325 = ((($8)) + 8|0);
    $$5493597 = $$0496$$9;
    while(1) {
     $326 = HEAP32[$$5493597>>2]|0;
     $327 = (_fmt_u($326,0,$323)|0);
     $328 = ($$5493597|0)==($$0496$$9|0);
     if ($328) {
      $334 = ($327|0)==($323|0);
      if ($334) {
       HEAP8[$325>>0] = 48;
       $$1465 = $325;
      } else {
       $$1465 = $327;
      }
     } else {
      $329 = ($327>>>0)>($8>>>0);
      if ($329) {
       $330 = $327;
       $331 = (($330) - ($9))|0;
       _memset(($8|0),48,($331|0))|0;
       $$0464594 = $327;
       while(1) {
        $332 = ((($$0464594)) + -1|0);
        $333 = ($332>>>0)>($8>>>0);
        if ($333) {
         $$0464594 = $332;
        } else {
         $$1465 = $332;
         break;
        }
       }
      } else {
       $$1465 = $327;
      }
     }
     $335 = $$1465;
     $336 = (($324) - ($335))|0;
     _out_669($0,$$1465,$336);
     $337 = ((($$5493597)) + 4|0);
     $338 = ($337>>>0)>($$556>>>0);
     if ($338) {
      break;
     } else {
      $$5493597 = $337;
     }
    }
    $339 = ($289|0)==(0);
    if (!($339)) {
     _out_669($0,9052,1);
    }
    $340 = ($337>>>0)<($$7505>>>0);
    $341 = ($$3477|0)>(0);
    $342 = $340 & $341;
    if ($342) {
     $$4478590 = $$3477;$$6494589 = $337;
     while(1) {
      $343 = HEAP32[$$6494589>>2]|0;
      $344 = (_fmt_u($343,0,$323)|0);
      $345 = ($344>>>0)>($8>>>0);
      if ($345) {
       $346 = $344;
       $347 = (($346) - ($9))|0;
       _memset(($8|0),48,($347|0))|0;
       $$0463584 = $344;
       while(1) {
        $348 = ((($$0463584)) + -1|0);
        $349 = ($348>>>0)>($8>>>0);
        if ($349) {
         $$0463584 = $348;
        } else {
         $$0463$lcssa = $348;
         break;
        }
       }
      } else {
       $$0463$lcssa = $344;
      }
      $350 = ($$4478590|0)<(9);
      $351 = $350 ? $$4478590 : 9;
      _out_669($0,$$0463$lcssa,$351);
      $352 = ((($$6494589)) + 4|0);
      $353 = (($$4478590) + -9)|0;
      $354 = ($352>>>0)<($$7505>>>0);
      $355 = ($$4478590|0)>(9);
      $356 = $354 & $355;
      if ($356) {
       $$4478590 = $353;$$6494589 = $352;
      } else {
       $$4478$lcssa = $353;
       break;
      }
     }
    } else {
     $$4478$lcssa = $$3477;
    }
    $357 = (($$4478$lcssa) + 9)|0;
    _pad_675($0,48,$357,9,0);
   } else {
    $358 = ((($$9$ph)) + 4|0);
    $$7505$ = $$lcssa673 ? $$7505 : $358;
    $359 = ($$3477|0)>(-1);
    if ($359) {
     $360 = ((($8)) + 9|0);
     $361 = ($$pre$phi690Z2D|0)==(0);
     $362 = $360;
     $363 = (0 - ($9))|0;
     $364 = ((($8)) + 8|0);
     $$5602 = $$3477;$$7495601 = $$9$ph;
     while(1) {
      $365 = HEAP32[$$7495601>>2]|0;
      $366 = (_fmt_u($365,0,$360)|0);
      $367 = ($366|0)==($360|0);
      if ($367) {
       HEAP8[$364>>0] = 48;
       $$0 = $364;
      } else {
       $$0 = $366;
      }
      $368 = ($$7495601|0)==($$9$ph|0);
      do {
       if ($368) {
        $372 = ((($$0)) + 1|0);
        _out_669($0,$$0,1);
        $373 = ($$5602|0)<(1);
        $or$cond554 = $361 & $373;
        if ($or$cond554) {
         $$2 = $372;
         break;
        }
        _out_669($0,9052,1);
        $$2 = $372;
       } else {
        $369 = ($$0>>>0)>($8>>>0);
        if (!($369)) {
         $$2 = $$0;
         break;
        }
        $scevgep684 = (($$0) + ($363)|0);
        $scevgep684685 = $scevgep684;
        _memset(($8|0),48,($scevgep684685|0))|0;
        $$1598 = $$0;
        while(1) {
         $370 = ((($$1598)) + -1|0);
         $371 = ($370>>>0)>($8>>>0);
         if ($371) {
          $$1598 = $370;
         } else {
          $$2 = $370;
          break;
         }
        }
       }
      } while(0);
      $374 = $$2;
      $375 = (($362) - ($374))|0;
      $376 = ($$5602|0)>($375|0);
      $377 = $376 ? $375 : $$5602;
      _out_669($0,$$2,$377);
      $378 = (($$5602) - ($375))|0;
      $379 = ((($$7495601)) + 4|0);
      $380 = ($379>>>0)<($$7505$>>>0);
      $381 = ($378|0)>(-1);
      $382 = $380 & $381;
      if ($382) {
       $$5602 = $378;$$7495601 = $379;
      } else {
       $$5$lcssa = $378;
       break;
      }
     }
    } else {
     $$5$lcssa = $$3477;
    }
    $383 = (($$5$lcssa) + 18)|0;
    _pad_675($0,48,$383,18,0);
    $384 = $11;
    $385 = $$2513;
    $386 = (($384) - ($385))|0;
    _out_669($0,$$2513,$386);
   }
   $387 = $4 ^ 8192;
   _pad_675($0,32,$2,$320,$387);
   $$sink562 = $320;
  } else {
   $27 = $5 & 32;
   $28 = ($27|0)!=(0);
   $29 = $28 ? 9020 : 9024;
   $30 = ($$0471 != $$0471) | (0.0 != 0.0);
   $31 = $28 ? 9028 : 9032;
   $$0510 = $30 ? $31 : $29;
   $32 = (($$0520) + 3)|0;
   $33 = $4 & -65537;
   _pad_675($0,32,$2,$32,$33);
   _out_669($0,$$0521,$$0520);
   _out_669($0,$$0510,3);
   $34 = $4 ^ 8192;
   _pad_675($0,32,$2,$32,$34);
   $$sink562 = $32;
  }
 } while(0);
 $388 = ($$sink562|0)<($2|0);
 $$555 = $388 ? $2 : $$sink562;
 STACKTOP = sp;return ($$555|0);
}
function ___DOUBLE_BITS_676($0) {
 $0 = +$0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$1 = HEAP32[tempDoublePtr>>2]|0;
 $2 = HEAP32[tempDoublePtr+4>>2]|0;
 tempRet0 = ($2);
 return ($1|0);
}
function _frexpl($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $2 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (+_frexp($0,$1));
 return (+$2);
}
function _frexp($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $$0 = 0.0, $$016 = 0.0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0.0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $9 = 0.0, $storemerge = 0, $trunc$clear = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$2 = HEAP32[tempDoublePtr>>2]|0;
 $3 = HEAP32[tempDoublePtr+4>>2]|0;
 $4 = (_bitshift64Lshr(($2|0),($3|0),52)|0);
 $5 = tempRet0;
 $6 = $4&65535;
 $trunc$clear = $6 & 2047;
 switch ($trunc$clear<<16>>16) {
 case 0:  {
  $7 = $0 != 0.0;
  if ($7) {
   $8 = $0 * 1.8446744073709552E+19;
   $9 = (+_frexp($8,$1));
   $10 = HEAP32[$1>>2]|0;
   $11 = (($10) + -64)|0;
   $$016 = $9;$storemerge = $11;
  } else {
   $$016 = $0;$storemerge = 0;
  }
  HEAP32[$1>>2] = $storemerge;
  $$0 = $$016;
  break;
 }
 case 2047:  {
  $$0 = $0;
  break;
 }
 default: {
  $12 = $4 & 2047;
  $13 = (($12) + -1022)|0;
  HEAP32[$1>>2] = $13;
  $14 = $3 & -2146435073;
  $15 = $14 | 1071644672;
  HEAP32[tempDoublePtr>>2] = $2;HEAP32[tempDoublePtr+4>>2] = $15;$16 = +HEAPF64[tempDoublePtr>>3];
  $$0 = $16;
 }
 }
 return (+$$0);
}
function _wcrtomb($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $not$ = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0|0);
 do {
  if ($3) {
   $$0 = 1;
  } else {
   $4 = ($1>>>0)<(128);
   if ($4) {
    $5 = $1&255;
    HEAP8[$0>>0] = $5;
    $$0 = 1;
    break;
   }
   $6 = (___pthread_self_907()|0);
   $7 = ((($6)) + 188|0);
   $8 = HEAP32[$7>>2]|0;
   $9 = HEAP32[$8>>2]|0;
   $not$ = ($9|0)==(0|0);
   if ($not$) {
    $10 = $1 & -128;
    $11 = ($10|0)==(57216);
    if ($11) {
     $13 = $1&255;
     HEAP8[$0>>0] = $13;
     $$0 = 1;
     break;
    } else {
     $12 = (___errno_location()|0);
     HEAP32[$12>>2] = 84;
     $$0 = -1;
     break;
    }
   }
   $14 = ($1>>>0)<(2048);
   if ($14) {
    $15 = $1 >>> 6;
    $16 = $15 | 192;
    $17 = $16&255;
    $18 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $17;
    $19 = $1 & 63;
    $20 = $19 | 128;
    $21 = $20&255;
    HEAP8[$18>>0] = $21;
    $$0 = 2;
    break;
   }
   $22 = ($1>>>0)<(55296);
   $23 = $1 & -8192;
   $24 = ($23|0)==(57344);
   $or$cond = $22 | $24;
   if ($or$cond) {
    $25 = $1 >>> 12;
    $26 = $25 | 224;
    $27 = $26&255;
    $28 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $27;
    $29 = $1 >>> 6;
    $30 = $29 & 63;
    $31 = $30 | 128;
    $32 = $31&255;
    $33 = ((($0)) + 2|0);
    HEAP8[$28>>0] = $32;
    $34 = $1 & 63;
    $35 = $34 | 128;
    $36 = $35&255;
    HEAP8[$33>>0] = $36;
    $$0 = 3;
    break;
   }
   $37 = (($1) + -65536)|0;
   $38 = ($37>>>0)<(1048576);
   if ($38) {
    $39 = $1 >>> 18;
    $40 = $39 | 240;
    $41 = $40&255;
    $42 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $41;
    $43 = $1 >>> 12;
    $44 = $43 & 63;
    $45 = $44 | 128;
    $46 = $45&255;
    $47 = ((($0)) + 2|0);
    HEAP8[$42>>0] = $46;
    $48 = $1 >>> 6;
    $49 = $48 & 63;
    $50 = $49 | 128;
    $51 = $50&255;
    $52 = ((($0)) + 3|0);
    HEAP8[$47>>0] = $51;
    $53 = $1 & 63;
    $54 = $53 | 128;
    $55 = $54&255;
    HEAP8[$52>>0] = $55;
    $$0 = 4;
    break;
   } else {
    $56 = (___errno_location()|0);
    HEAP32[$56>>2] = 84;
    $$0 = -1;
    break;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___pthread_self_907() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function ___pthread_self_86() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function ___strerror_l($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $$016 = 0;
 while(1) {
  $3 = (9054 + ($$016)|0);
  $4 = HEAP8[$3>>0]|0;
  $5 = $4&255;
  $6 = ($5|0)==($0|0);
  if ($6) {
   label = 2;
   break;
  }
  $7 = (($$016) + 1)|0;
  $8 = ($7|0)==(87);
  if ($8) {
   $$01214 = 9142;$$115 = 87;
   label = 5;
   break;
  } else {
   $$016 = $7;
  }
 }
 if ((label|0) == 2) {
  $2 = ($$016|0)==(0);
  if ($2) {
   $$012$lcssa = 9142;
  } else {
   $$01214 = 9142;$$115 = $$016;
   label = 5;
  }
 }
 if ((label|0) == 5) {
  while(1) {
   label = 0;
   $$113 = $$01214;
   while(1) {
    $9 = HEAP8[$$113>>0]|0;
    $10 = ($9<<24>>24)==(0);
    $11 = ((($$113)) + 1|0);
    if ($10) {
     break;
    } else {
     $$113 = $11;
    }
   }
   $12 = (($$115) + -1)|0;
   $13 = ($12|0)==(0);
   if ($13) {
    $$012$lcssa = $11;
    break;
   } else {
    $$01214 = $11;$$115 = $12;
    label = 5;
   }
  }
 }
 $14 = ((($1)) + 20|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = (___lctrans($$012$lcssa,$15)|0);
 return ($16|0);
}
function ___lctrans($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (___lctrans_impl($0,$1)|0);
 return ($2|0);
}
function _memcmp($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($2|0)==(0);
 L1: do {
  if ($3) {
   $14 = 0;
  } else {
   $$01318 = $0;$$01417 = $2;$$019 = $1;
   while(1) {
    $4 = HEAP8[$$01318>>0]|0;
    $5 = HEAP8[$$019>>0]|0;
    $6 = ($4<<24>>24)==($5<<24>>24);
    if (!($6)) {
     break;
    }
    $7 = (($$01417) + -1)|0;
    $8 = ((($$01318)) + 1|0);
    $9 = ((($$019)) + 1|0);
    $10 = ($7|0)==(0);
    if ($10) {
     $14 = 0;
     break L1;
    } else {
     $$01318 = $8;$$01417 = $7;$$019 = $9;
    }
   }
   $11 = $4&255;
   $12 = $5&255;
   $13 = (($11) - ($12))|0;
   $14 = $13;
  }
 } while(0);
 return ($14|0);
}
function ___strdup($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (_strlen($0)|0);
 $2 = (($1) + 1)|0;
 $3 = (_malloc($2)|0);
 $4 = ($3|0)==(0|0);
 if ($4) {
  $$0 = 0;
 } else {
  _memcpy(($3|0),($0|0),($2|0))|0;
  $$0 = $3;
 }
 return ($$0|0);
}
function _fputc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($1)) + 76|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)<(0);
 $5 = $0&255;
 $6 = $0 & 255;
 if ($4) {
  label = 3;
 } else {
  $7 = (___lockfile($1)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   label = 3;
  } else {
   $20 = ((($1)) + 75|0);
   $21 = HEAP8[$20>>0]|0;
   $22 = $21 << 24 >> 24;
   $23 = ($6|0)==($22|0);
   if ($23) {
    label = 10;
   } else {
    $24 = ((($1)) + 20|0);
    $25 = HEAP32[$24>>2]|0;
    $26 = ((($1)) + 16|0);
    $27 = HEAP32[$26>>2]|0;
    $28 = ($25>>>0)<($27>>>0);
    if ($28) {
     $29 = ((($25)) + 1|0);
     HEAP32[$24>>2] = $29;
     HEAP8[$25>>0] = $5;
     $31 = $6;
    } else {
     label = 10;
    }
   }
   if ((label|0) == 10) {
    $30 = (___overflow($1,$0)|0);
    $31 = $30;
   }
   ___unlockfile($1);
   $$0 = $31;
  }
 }
 do {
  if ((label|0) == 3) {
   $9 = ((($1)) + 75|0);
   $10 = HEAP8[$9>>0]|0;
   $11 = $10 << 24 >> 24;
   $12 = ($6|0)==($11|0);
   if (!($12)) {
    $13 = ((($1)) + 20|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = ((($1)) + 16|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ($14>>>0)<($16>>>0);
    if ($17) {
     $18 = ((($14)) + 1|0);
     HEAP32[$13>>2] = $18;
     HEAP8[$14>>0] = $5;
     $$0 = $6;
     break;
    }
   }
   $19 = (___overflow($1,$0)|0);
   $$0 = $19;
  }
 } while(0);
 return ($$0|0);
}
function __Znwj($0) {
 $0 = $0|0;
 var $$ = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0);
 $$ = $1 ? 1 : $0;
 while(1) {
  $2 = (_malloc($$)|0);
  $3 = ($2|0)==(0|0);
  if (!($3)) {
   label = 6;
   break;
  }
  $4 = (__ZSt15get_new_handlerv()|0);
  $5 = ($4|0)==(0|0);
  if ($5) {
   label = 5;
   break;
  }
  FUNCTION_TABLE_v[$4 & 127]();
 }
 if ((label|0) == 5) {
  $6 = (___cxa_allocate_exception(4)|0);
  __ZNSt9bad_allocC2Ev($6);
  ___cxa_throw(($6|0),(3464|0),(18|0));
  // unreachable;
 }
 else if ((label|0) == 6) {
  return ($2|0);
 }
 return (0)|0;
}
function __ZdlPv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _free($0);
 return;
}
function __ZNSt3__218__libcpp_refstringC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (_strlen($1)|0);
 $3 = (($2) + 13)|0;
 $4 = (__Znwj($3)|0);
 HEAP32[$4>>2] = $2;
 $5 = ((($4)) + 4|0);
 HEAP32[$5>>2] = $2;
 $6 = ((($4)) + 8|0);
 HEAP32[$6>>2] = 0;
 $7 = (__ZNSt3__215__refstring_imp12_GLOBAL__N_113data_from_repEPNS1_9_Rep_baseE($4)|0);
 $8 = (($2) + 1)|0;
 _memcpy(($7|0),($1|0),($8|0))|0;
 HEAP32[$0>>2] = $7;
 return;
}
function __ZNSt3__215__refstring_imp12_GLOBAL__N_113data_from_repEPNS1_9_Rep_baseE($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 12|0);
 return ($1|0);
}
function __ZNSt11logic_errorC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (4436);
 $2 = ((($0)) + 4|0);
 __THREW__ = 0;
 invoke_vii(121,($2|0),($1|0));
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  ___resumeException($5|0);
  // unreachable;
 } else {
  return;
 }
}
function __ZNKSt3__218__libcpp_refstring15__uses_refcountEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 1;
}
function __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (___cxa_allocate_exception(8)|0);
 __THREW__ = 0;
 invoke_vii(122,($1|0),(10946|0));
 $2 = __THREW__; __THREW__ = 0;
 $3 = $2&1;
 if ($3) {
  $4 = ___cxa_find_matching_catch_2()|0;
  $5 = tempRet0;
  ___cxa_free_exception(($1|0));
  ___resumeException($4|0);
  // unreachable;
 } else {
  HEAP32[$1>>2] = (4456);
  ___cxa_throw(($1|0),(3496|0),(21|0));
  // unreachable;
 }
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 11|0);
 $2 = HEAP8[$1>>0]|0;
 $3 = ($2<<24>>24)<(0);
 if ($3) {
  $4 = HEAP32[$0>>2]|0;
  __ZdlPv($4);
 }
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0;
 var $vararg_buffer7 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer10 = sp + 32|0;
 $vararg_buffer7 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $0 = sp + 36|0;
 $1 = (___cxa_get_globals_fast()|0);
 $2 = ($1|0)==(0|0);
 if (!($2)) {
  $3 = HEAP32[$1>>2]|0;
  $4 = ($3|0)==(0|0);
  if (!($4)) {
   $5 = ((($3)) + 80|0);
   $6 = ((($3)) + 48|0);
   $7 = $6;
   $8 = $7;
   $9 = HEAP32[$8>>2]|0;
   $10 = (($7) + 4)|0;
   $11 = $10;
   $12 = HEAP32[$11>>2]|0;
   $13 = $9 & -256;
   $14 = ($13|0)==(1126902528);
   $15 = ($12|0)==(1129074247);
   $16 = $14 & $15;
   if (!($16)) {
    $36 = HEAP32[1081]|0;
    HEAP32[$vararg_buffer7>>2] = $36;
    _abort_message(11045,$vararg_buffer7);
    // unreachable;
   }
   $17 = ($9|0)==(1126902529);
   $18 = ($12|0)==(1129074247);
   $19 = $17 & $18;
   if ($19) {
    $20 = ((($3)) + 44|0);
    $21 = HEAP32[$20>>2]|0;
    $22 = $21;
   } else {
    $22 = $5;
   }
   HEAP32[$0>>2] = $22;
   $23 = HEAP32[$3>>2]|0;
   $24 = ((($23)) + 4|0);
   $25 = HEAP32[$24>>2]|0;
   $26 = HEAP32[850]|0;
   $27 = ((($26)) + 16|0);
   $28 = HEAP32[$27>>2]|0;
   $29 = (FUNCTION_TABLE_iiii[$28 & 127](3400,$23,$0)|0);
   $30 = HEAP32[1081]|0;
   if ($29) {
    $31 = HEAP32[$0>>2]|0;
    $32 = HEAP32[$31>>2]|0;
    $33 = ((($32)) + 8|0);
    $34 = HEAP32[$33>>2]|0;
    $35 = (FUNCTION_TABLE_ii[$34 & 127]($31)|0);
    HEAP32[$vararg_buffer>>2] = $30;
    $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
    HEAP32[$vararg_ptr1>>2] = $25;
    $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
    HEAP32[$vararg_ptr2>>2] = $35;
    _abort_message(10959,$vararg_buffer);
    // unreachable;
   } else {
    HEAP32[$vararg_buffer3>>2] = $30;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $25;
    _abort_message(11004,$vararg_buffer3);
    // unreachable;
   }
  }
 }
 _abort_message(11083,$vararg_buffer10);
 // unreachable;
}
function ___cxa_get_globals_fast() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $0 = (_pthread_once((12292|0),(123|0))|0);
 $1 = ($0|0)==(0);
 if ($1) {
  $2 = HEAP32[3074]|0;
  $3 = (_pthread_getspecific(($2|0))|0);
  STACKTOP = sp;return ($3|0);
 } else {
  _abort_message(11234,$vararg_buffer);
  // unreachable;
 }
 return (0)|0;
}
function _abort_message($0,$varargs) {
 $0 = $0|0;
 $varargs = $varargs|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 HEAP32[$1>>2] = $varargs;
 $2 = HEAP32[955]|0;
 (_vfprintf($2,$0,$1)|0);
 (_fputc(10,$2)|0);
 _abort();
 // unreachable;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$2 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $3 = sp;
 $4 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$1,0)|0);
 if ($4) {
  $$2 = 1;
 } else {
  $5 = ($1|0)==(0|0);
  if ($5) {
   $$2 = 0;
  } else {
   $6 = (___dynamic_cast($1,3424,3408,0)|0);
   $7 = ($6|0)==(0|0);
   if ($7) {
    $$2 = 0;
   } else {
    $8 = ((($3)) + 4|0);
    dest=$8; stop=dest+52|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
    HEAP32[$3>>2] = $6;
    $9 = ((($3)) + 8|0);
    HEAP32[$9>>2] = $0;
    $10 = ((($3)) + 12|0);
    HEAP32[$10>>2] = -1;
    $11 = ((($3)) + 48|0);
    HEAP32[$11>>2] = 1;
    $12 = HEAP32[$6>>2]|0;
    $13 = ((($12)) + 28|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = HEAP32[$2>>2]|0;
    FUNCTION_TABLE_viiii[$14 & 127]($6,$3,$15,1);
    $16 = ((($3)) + 24|0);
    $17 = HEAP32[$16>>2]|0;
    $18 = ($17|0)==(1);
    if ($18) {
     $19 = ((($3)) + 16|0);
     $20 = HEAP32[$19>>2]|0;
     HEAP32[$2>>2] = $20;
     $$0 = 1;
    } else {
     $$0 = 0;
    }
    $$2 = $$0;
   }
  }
 }
 STACKTOP = sp;return ($$2|0);
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$7,$5)|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$6,$4)|0);
 do {
  if ($7) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$1,$2,$3);
  } else {
   $8 = HEAP32[$1>>2]|0;
   $9 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$8,$4)|0);
   if ($9) {
    $10 = ((($1)) + 16|0);
    $11 = HEAP32[$10>>2]|0;
    $12 = ($11|0)==($2|0);
    $13 = ((($1)) + 32|0);
    if (!($12)) {
     $14 = ((($1)) + 20|0);
     $15 = HEAP32[$14>>2]|0;
     $16 = ($15|0)==($2|0);
     if (!($16)) {
      HEAP32[$13>>2] = $3;
      HEAP32[$14>>2] = $2;
      $18 = ((($1)) + 40|0);
      $19 = HEAP32[$18>>2]|0;
      $20 = (($19) + 1)|0;
      HEAP32[$18>>2] = $20;
      $21 = ((($1)) + 36|0);
      $22 = HEAP32[$21>>2]|0;
      $23 = ($22|0)==(1);
      if ($23) {
       $24 = ((($1)) + 24|0);
       $25 = HEAP32[$24>>2]|0;
       $26 = ($25|0)==(2);
       if ($26) {
        $27 = ((($1)) + 54|0);
        HEAP8[$27>>0] = 1;
       }
      }
      $28 = ((($1)) + 44|0);
      HEAP32[$28>>2] = 4;
      break;
     }
    }
    $17 = ($3|0)==(1);
    if ($17) {
     HEAP32[$13>>2] = 1;
    }
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$5,0)|0);
 if ($6) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
 }
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==($1|0);
 return ($3|0);
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 $7 = ((($1)) + 36|0);
 $8 = ((($1)) + 24|0);
 do {
  if ($6) {
   HEAP32[$4>>2] = $2;
   HEAP32[$8>>2] = $3;
   HEAP32[$7>>2] = 1;
  } else {
   $9 = ($5|0)==($2|0);
   if (!($9)) {
    $12 = HEAP32[$7>>2]|0;
    $13 = (($12) + 1)|0;
    HEAP32[$7>>2] = $13;
    HEAP32[$8>>2] = 2;
    $14 = ((($1)) + 54|0);
    HEAP8[$14>>0] = 1;
    break;
   }
   $10 = HEAP32[$8>>2]|0;
   $11 = ($10|0)==(2);
   if ($11) {
    HEAP32[$8>>2] = $3;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==($2|0);
 if ($6) {
  $7 = ((($1)) + 28|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = ($8|0)==(1);
  if (!($9)) {
   HEAP32[$7>>2] = $3;
  }
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond22 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 53|0);
 HEAP8[$5>>0] = 1;
 $6 = ((($1)) + 4|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)==($3|0);
 do {
  if ($8) {
   $9 = ((($1)) + 52|0);
   HEAP8[$9>>0] = 1;
   $10 = ((($1)) + 16|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)==(0|0);
   $13 = ((($1)) + 54|0);
   $14 = ((($1)) + 48|0);
   $15 = ((($1)) + 24|0);
   $16 = ((($1)) + 36|0);
   if ($12) {
    HEAP32[$10>>2] = $2;
    HEAP32[$15>>2] = $4;
    HEAP32[$16>>2] = 1;
    $17 = HEAP32[$14>>2]|0;
    $18 = ($17|0)==(1);
    $19 = ($4|0)==(1);
    $or$cond = $18 & $19;
    if (!($or$cond)) {
     break;
    }
    HEAP8[$13>>0] = 1;
    break;
   }
   $20 = ($11|0)==($2|0);
   if (!($20)) {
    $27 = HEAP32[$16>>2]|0;
    $28 = (($27) + 1)|0;
    HEAP32[$16>>2] = $28;
    HEAP8[$13>>0] = 1;
    break;
   }
   $21 = HEAP32[$15>>2]|0;
   $22 = ($21|0)==(2);
   if ($22) {
    HEAP32[$15>>2] = $4;
    $26 = $4;
   } else {
    $26 = $21;
   }
   $23 = HEAP32[$14>>2]|0;
   $24 = ($23|0)==(1);
   $25 = ($26|0)==(1);
   $or$cond22 = $24 & $25;
   if ($or$cond22) {
    HEAP8[$13>>0] = 1;
   }
  }
 } while(0);
 return;
}
function ___dynamic_cast($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$ = 0, $$0 = 0, $$33 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond28 = 0, $or$cond30 = 0, $or$cond32 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $4 = sp;
 $5 = HEAP32[$0>>2]|0;
 $6 = ((($5)) + -8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (($0) + ($7)|0);
 $9 = ((($5)) + -4|0);
 $10 = HEAP32[$9>>2]|0;
 HEAP32[$4>>2] = $2;
 $11 = ((($4)) + 4|0);
 HEAP32[$11>>2] = $0;
 $12 = ((($4)) + 8|0);
 HEAP32[$12>>2] = $1;
 $13 = ((($4)) + 12|0);
 HEAP32[$13>>2] = $3;
 $14 = ((($4)) + 16|0);
 $15 = ((($4)) + 20|0);
 $16 = ((($4)) + 24|0);
 $17 = ((($4)) + 28|0);
 $18 = ((($4)) + 32|0);
 $19 = ((($4)) + 40|0);
 dest=$14; stop=dest+36|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));HEAP16[$14+36>>1]=0|0;HEAP8[$14+38>>0]=0|0;
 $20 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10,$2,0)|0);
 L1: do {
  if ($20) {
   $21 = ((($4)) + 48|0);
   HEAP32[$21>>2] = 1;
   $22 = HEAP32[$10>>2]|0;
   $23 = ((($22)) + 20|0);
   $24 = HEAP32[$23>>2]|0;
   FUNCTION_TABLE_viiiiii[$24 & 31]($10,$4,$8,$8,1,0);
   $25 = HEAP32[$16>>2]|0;
   $26 = ($25|0)==(1);
   $$ = $26 ? $8 : 0;
   $$0 = $$;
  } else {
   $27 = ((($4)) + 36|0);
   $28 = HEAP32[$10>>2]|0;
   $29 = ((($28)) + 24|0);
   $30 = HEAP32[$29>>2]|0;
   FUNCTION_TABLE_viiiii[$30 & 31]($10,$4,$8,1,0);
   $31 = HEAP32[$27>>2]|0;
   switch ($31|0) {
   case 0:  {
    $32 = HEAP32[$19>>2]|0;
    $33 = ($32|0)==(1);
    $34 = HEAP32[$17>>2]|0;
    $35 = ($34|0)==(1);
    $or$cond = $33 & $35;
    $36 = HEAP32[$18>>2]|0;
    $37 = ($36|0)==(1);
    $or$cond28 = $or$cond & $37;
    $38 = HEAP32[$15>>2]|0;
    $$33 = $or$cond28 ? $38 : 0;
    $$0 = $$33;
    break L1;
    break;
   }
   case 1:  {
    break;
   }
   default: {
    $$0 = 0;
    break L1;
   }
   }
   $39 = HEAP32[$16>>2]|0;
   $40 = ($39|0)==(1);
   if (!($40)) {
    $41 = HEAP32[$19>>2]|0;
    $42 = ($41|0)==(0);
    $43 = HEAP32[$17>>2]|0;
    $44 = ($43|0)==(1);
    $or$cond30 = $42 & $44;
    $45 = HEAP32[$18>>2]|0;
    $46 = ($45|0)==(1);
    $or$cond32 = $or$cond30 & $46;
    if (!($or$cond32)) {
     $$0 = 0;
     break;
    }
   }
   $47 = HEAP32[$14>>2]|0;
   $$0 = $47;
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$7,$5)|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 } else {
  $9 = ((($0)) + 8|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = HEAP32[$10>>2]|0;
  $12 = ((($11)) + 20|0);
  $13 = HEAP32[$12>>2]|0;
  FUNCTION_TABLE_viiiiii[$13 & 31]($10,$1,$2,$3,$4,$5);
 }
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$037$off038 = 0, $$037$off039 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $not$ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$6,$4)|0);
 do {
  if ($7) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$1,$2,$3);
  } else {
   $8 = HEAP32[$1>>2]|0;
   $9 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$8,$4)|0);
   $10 = ((($0)) + 8|0);
   if (!($9)) {
    $41 = HEAP32[$10>>2]|0;
    $42 = HEAP32[$41>>2]|0;
    $43 = ((($42)) + 24|0);
    $44 = HEAP32[$43>>2]|0;
    FUNCTION_TABLE_viiiii[$44 & 31]($41,$1,$2,$3,$4);
    break;
   }
   $11 = ((($1)) + 16|0);
   $12 = HEAP32[$11>>2]|0;
   $13 = ($12|0)==($2|0);
   $14 = ((($1)) + 32|0);
   if (!($13)) {
    $15 = ((($1)) + 20|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ($16|0)==($2|0);
    if (!($17)) {
     HEAP32[$14>>2] = $3;
     $19 = ((($1)) + 44|0);
     $20 = HEAP32[$19>>2]|0;
     $21 = ($20|0)==(4);
     if ($21) {
      break;
     }
     $22 = ((($1)) + 52|0);
     HEAP8[$22>>0] = 0;
     $23 = ((($1)) + 53|0);
     HEAP8[$23>>0] = 0;
     $24 = HEAP32[$10>>2]|0;
     $25 = HEAP32[$24>>2]|0;
     $26 = ((($25)) + 20|0);
     $27 = HEAP32[$26>>2]|0;
     FUNCTION_TABLE_viiiiii[$27 & 31]($24,$1,$2,$2,1,$4);
     $28 = HEAP8[$23>>0]|0;
     $29 = ($28<<24>>24)==(0);
     if ($29) {
      $$037$off038 = 4;
      label = 11;
     } else {
      $30 = HEAP8[$22>>0]|0;
      $not$ = ($30<<24>>24)==(0);
      if ($not$) {
       $$037$off038 = 3;
       label = 11;
      } else {
       $$037$off039 = 3;
      }
     }
     if ((label|0) == 11) {
      HEAP32[$15>>2] = $2;
      $31 = ((($1)) + 40|0);
      $32 = HEAP32[$31>>2]|0;
      $33 = (($32) + 1)|0;
      HEAP32[$31>>2] = $33;
      $34 = ((($1)) + 36|0);
      $35 = HEAP32[$34>>2]|0;
      $36 = ($35|0)==(1);
      if ($36) {
       $37 = ((($1)) + 24|0);
       $38 = HEAP32[$37>>2]|0;
       $39 = ($38|0)==(2);
       if ($39) {
        $40 = ((($1)) + 54|0);
        HEAP8[$40>>0] = 1;
        $$037$off039 = $$037$off038;
       } else {
        $$037$off039 = $$037$off038;
       }
      } else {
       $$037$off039 = $$037$off038;
      }
     }
     HEAP32[$19>>2] = $$037$off039;
     break;
    }
   }
   $18 = ($3|0)==(1);
   if ($18) {
    HEAP32[$14>>2] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$5,0)|0);
 if ($6) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
 } else {
  $7 = ((($0)) + 8|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = HEAP32[$8>>2]|0;
  $10 = ((($9)) + 28|0);
  $11 = HEAP32[$10>>2]|0;
  FUNCTION_TABLE_viiii[$11 & 127]($8,$1,$2,$3);
 }
 return;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var $0 = 0, $1 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $0 = (_pthread_key_create((12296|0),(124|0))|0);
 $1 = ($0|0)==(0);
 if ($1) {
  STACKTOP = sp;return;
 } else {
  _abort_message(11283,$vararg_buffer);
  // unreachable;
 }
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 _free($0);
 $1 = HEAP32[3074]|0;
 $2 = (_pthread_setspecific(($1|0),(0|0))|0);
 $3 = ($2|0)==(0);
 if ($3) {
  STACKTOP = sp;return;
 } else {
  _abort_message(11333,$vararg_buffer);
  // unreachable;
 }
}
function __ZSt9terminatev() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __THREW__ = 0;
 $0 = (invoke_i(125)|0);
 $1 = __THREW__; __THREW__ = 0;
 $2 = $1&1;
 if ($2) {
  $20 = ___cxa_find_matching_catch_3(0|0)|0;
  $21 = tempRet0;
  ___clang_call_terminate($20);
  // unreachable;
 }
 $3 = ($0|0)==(0|0);
 if (!($3)) {
  $4 = HEAP32[$0>>2]|0;
  $5 = ($4|0)==(0|0);
  if (!($5)) {
   $6 = ((($4)) + 48|0);
   $7 = $6;
   $8 = $7;
   $9 = HEAP32[$8>>2]|0;
   $10 = (($7) + 4)|0;
   $11 = $10;
   $12 = HEAP32[$11>>2]|0;
   $13 = $9 & -256;
   $14 = ($13|0)==(1126902528);
   $15 = ($12|0)==(1129074247);
   $16 = $14 & $15;
   if ($16) {
    $17 = ((($4)) + 12|0);
    $18 = HEAP32[$17>>2]|0;
    __ZSt11__terminatePFvvE($18);
    // unreachable;
   }
  }
 }
 $19 = (__ZSt13get_terminatev()|0);
 __ZSt11__terminatePFvvE($19);
 // unreachable;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 __THREW__ = 0;
 invoke_v($0|0);
 $1 = __THREW__; __THREW__ = 0;
 $2 = $1&1;
 if (!($2)) {
  __THREW__ = 0;
  invoke_vii(126,(11386|0),($vararg_buffer|0));
  $3 = __THREW__; __THREW__ = 0;
 }
 $4 = ___cxa_find_matching_catch_3(0|0)|0;
 $5 = tempRet0;
 (___cxa_begin_catch(($4|0))|0);
 __THREW__ = 0;
 invoke_vii(126,(11426|0),($vararg_buffer1|0));
 $6 = __THREW__; __THREW__ = 0;
 $7 = ___cxa_find_matching_catch_3(0|0)|0;
 $8 = tempRet0;
 __THREW__ = 0;
 invoke_v(127);
 $9 = __THREW__; __THREW__ = 0;
 $10 = $9&1;
 if ($10) {
  $11 = ___cxa_find_matching_catch_3(0|0)|0;
  $12 = tempRet0;
  ___clang_call_terminate($11);
  // unreachable;
 } else {
  ___clang_call_terminate($7);
  // unreachable;
 }
}
function __ZSt13get_terminatev() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[1080]|0;HEAP32[1080] = (($0+0)|0);
 $1 = $0;
 return ($1|0);
}
function __ZNSt9bad_allocD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNSt9bad_allocD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt9bad_allocD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNKSt9bad_alloc4whatEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (11476|0);
}
function __ZNSt9exceptionD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNSt11logic_errorD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (4436);
 $1 = ((($0)) + 4|0);
 __ZNSt3__218__libcpp_refstringD2Ev($1);
 return;
}
function __ZNSt11logic_errorD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt11logic_errorD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNKSt11logic_error4whatEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = (__ZNKSt3__218__libcpp_refstring5c_strEv($1)|0);
 return ($2|0);
}
function __ZNKSt3__218__libcpp_refstring5c_strEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 return ($1|0);
}
function __ZNSt3__218__libcpp_refstringD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (__ZNKSt3__218__libcpp_refstring15__uses_refcountEv($0)|0);
 if ($1) {
  $2 = HEAP32[$0>>2]|0;
  $3 = (__ZNSt3__215__refstring_imp12_GLOBAL__N_113rep_from_dataEPKc_170($2)|0);
  $4 = ((($3)) + 8|0);
  $5 = HEAP32[$4>>2]|0;HEAP32[$4>>2] = (($5+-1)|0);
  $6 = (($5) + -1)|0;
  $7 = ($6|0)<(0);
  if ($7) {
   __ZdlPv($3);
  }
 }
 return;
}
function __ZNSt3__215__refstring_imp12_GLOBAL__N_113rep_from_dataEPKc_170($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + -12|0);
 return ($1|0);
}
function __ZNSt12length_errorD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt11logic_errorD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZN10__cxxabiv123__fundamental_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv123__fundamental_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$1,0)|0);
 return ($3|0);
}
function __ZN10__cxxabiv119__pointer_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv119__pointer_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$4 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $3 = sp;
 $4 = HEAP32[$2>>2]|0;
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$2>>2] = $5;
 $6 = (__ZNK10__cxxabiv117__pbase_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,0)|0);
 if ($6) {
  $$4 = 1;
 } else {
  $7 = ($1|0)==(0|0);
  if ($7) {
   $$4 = 0;
  } else {
   $8 = (___dynamic_cast($1,3424,3528,0)|0);
   $9 = ($8|0)==(0|0);
   if ($9) {
    $$4 = 0;
   } else {
    $10 = ((($8)) + 8|0);
    $11 = HEAP32[$10>>2]|0;
    $12 = ((($0)) + 8|0);
    $13 = HEAP32[$12>>2]|0;
    $14 = $13 ^ -1;
    $15 = $11 & $14;
    $16 = ($15|0)==(0);
    if ($16) {
     $17 = ((($0)) + 12|0);
     $18 = HEAP32[$17>>2]|0;
     $19 = ((($8)) + 12|0);
     $20 = HEAP32[$19>>2]|0;
     $21 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($18,$20,0)|0);
     if ($21) {
      $$4 = 1;
     } else {
      $22 = HEAP32[$17>>2]|0;
      $23 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($22,3560,0)|0);
      if ($23) {
       $$4 = 1;
      } else {
       $24 = HEAP32[$17>>2]|0;
       $25 = ($24|0)==(0|0);
       if ($25) {
        $$4 = 0;
       } else {
        $26 = (___dynamic_cast($24,3424,3408,0)|0);
        $27 = ($26|0)==(0|0);
        if ($27) {
         $$4 = 0;
        } else {
         $28 = HEAP32[$19>>2]|0;
         $29 = ($28|0)==(0|0);
         if ($29) {
          $$4 = 0;
         } else {
          $30 = (___dynamic_cast($28,3424,3408,0)|0);
          $31 = ($30|0)==(0|0);
          if ($31) {
           $$4 = 0;
          } else {
           $32 = ((($3)) + 4|0);
           dest=$32; stop=dest+52|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
           HEAP32[$3>>2] = $30;
           $33 = ((($3)) + 8|0);
           HEAP32[$33>>2] = $26;
           $34 = ((($3)) + 12|0);
           HEAP32[$34>>2] = -1;
           $35 = ((($3)) + 48|0);
           HEAP32[$35>>2] = 1;
           $36 = HEAP32[$30>>2]|0;
           $37 = ((($36)) + 28|0);
           $38 = HEAP32[$37>>2]|0;
           $39 = HEAP32[$2>>2]|0;
           FUNCTION_TABLE_viiii[$38 & 127]($30,$3,$39,1);
           $40 = ((($3)) + 24|0);
           $41 = HEAP32[$40>>2]|0;
           $42 = ($41|0)==(1);
           if ($42) {
            $43 = ((($3)) + 16|0);
            $44 = HEAP32[$43>>2]|0;
            HEAP32[$2>>2] = $44;
            $$0 = 1;
           } else {
            $$0 = 0;
           }
           $$4 = $$0;
          }
         }
        }
       }
      }
     }
    } else {
     $$4 = 0;
    }
   }
  }
 }
 STACKTOP = sp;return ($$4|0);
}
function __ZNK10__cxxabiv117__pbase_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$1,0)|0);
 if ($3) {
  $$0 = 1;
 } else {
  $4 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($1,3568,0)|0);
  $$0 = $4;
 }
 return ($$0|0);
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$7,$5)|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 } else {
  $9 = ((($1)) + 52|0);
  $10 = HEAP8[$9>>0]|0;
  $11 = ((($1)) + 53|0);
  $12 = HEAP8[$11>>0]|0;
  $13 = ((($0)) + 16|0);
  $14 = ((($0)) + 12|0);
  $15 = HEAP32[$14>>2]|0;
  $16 = (((($0)) + 16|0) + ($15<<3)|0);
  HEAP8[$9>>0] = 0;
  HEAP8[$11>>0] = 0;
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($13,$1,$2,$3,$4,$5);
  $17 = ($15|0)>(1);
  L4: do {
   if ($17) {
    $18 = ((($0)) + 24|0);
    $19 = ((($1)) + 24|0);
    $20 = ((($1)) + 54|0);
    $21 = ((($0)) + 8|0);
    $$0 = $18;
    while(1) {
     $22 = HEAP8[$20>>0]|0;
     $23 = ($22<<24>>24)==(0);
     if (!($23)) {
      break L4;
     }
     $24 = HEAP8[$9>>0]|0;
     $25 = ($24<<24>>24)==(0);
     if ($25) {
      $31 = HEAP8[$11>>0]|0;
      $32 = ($31<<24>>24)==(0);
      if (!($32)) {
       $33 = HEAP32[$21>>2]|0;
       $34 = $33 & 1;
       $35 = ($34|0)==(0);
       if ($35) {
        break L4;
       }
      }
     } else {
      $26 = HEAP32[$19>>2]|0;
      $27 = ($26|0)==(1);
      if ($27) {
       break L4;
      }
      $28 = HEAP32[$21>>2]|0;
      $29 = $28 & 2;
      $30 = ($29|0)==(0);
      if ($30) {
       break L4;
      }
     }
     HEAP8[$9>>0] = 0;
     HEAP8[$11>>0] = 0;
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0,$1,$2,$3,$4,$5);
     $36 = ((($$0)) + 8|0);
     $37 = ($36>>>0)<($16>>>0);
     if ($37) {
      $$0 = $36;
     } else {
      break;
     }
    }
   }
  } while(0);
  HEAP8[$9>>0] = $10;
  HEAP8[$11>>0] = $12;
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0;
 var $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$6,$4)|0);
 L1: do {
  if ($7) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$1,$2,$3);
  } else {
   $8 = HEAP32[$1>>2]|0;
   $9 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$8,$4)|0);
   $10 = ((($0)) + 12|0);
   $11 = ((($1)) + 24|0);
   $12 = ((($1)) + 36|0);
   $13 = ((($1)) + 54|0);
   $14 = ((($0)) + 8|0);
   $15 = ((($0)) + 16|0);
   if (!($9)) {
    $55 = HEAP32[$10>>2]|0;
    $56 = (((($0)) + 16|0) + ($55<<3)|0);
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($15,$1,$2,$3,$4);
    $57 = ((($0)) + 24|0);
    $58 = ($55|0)>(1);
    if (!($58)) {
     break;
    }
    $59 = HEAP32[$14>>2]|0;
    $60 = $59 & 2;
    $61 = ($60|0)==(0);
    if ($61) {
     $62 = HEAP32[$12>>2]|0;
     $63 = ($62|0)==(1);
     if ($63) {
      $$0 = $57;
     } else {
      $68 = $59 & 1;
      $69 = ($68|0)==(0);
      if ($69) {
       $$2 = $57;
       while(1) {
        $78 = HEAP8[$13>>0]|0;
        $79 = ($78<<24>>24)==(0);
        if (!($79)) {
         break L1;
        }
        $80 = HEAP32[$12>>2]|0;
        $81 = ($80|0)==(1);
        if ($81) {
         break L1;
        }
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2,$1,$2,$3,$4);
        $82 = ((($$2)) + 8|0);
        $83 = ($82>>>0)<($56>>>0);
        if ($83) {
         $$2 = $82;
        } else {
         break L1;
        }
       }
      } else {
       $$1 = $57;
      }
      while(1) {
       $70 = HEAP8[$13>>0]|0;
       $71 = ($70<<24>>24)==(0);
       if (!($71)) {
        break L1;
       }
       $72 = HEAP32[$12>>2]|0;
       $73 = ($72|0)==(1);
       if ($73) {
        $74 = HEAP32[$11>>2]|0;
        $75 = ($74|0)==(1);
        if ($75) {
         break L1;
        }
       }
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1,$1,$2,$3,$4);
       $76 = ((($$1)) + 8|0);
       $77 = ($76>>>0)<($56>>>0);
       if ($77) {
        $$1 = $76;
       } else {
        break L1;
       }
      }
     }
    } else {
     $$0 = $57;
    }
    while(1) {
     $64 = HEAP8[$13>>0]|0;
     $65 = ($64<<24>>24)==(0);
     if (!($65)) {
      break L1;
     }
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0,$1,$2,$3,$4);
     $66 = ((($$0)) + 8|0);
     $67 = ($66>>>0)<($56>>>0);
     if ($67) {
      $$0 = $66;
     } else {
      break L1;
     }
    }
   }
   $16 = ((($1)) + 16|0);
   $17 = HEAP32[$16>>2]|0;
   $18 = ($17|0)==($2|0);
   $19 = ((($1)) + 32|0);
   if (!($18)) {
    $20 = ((($1)) + 20|0);
    $21 = HEAP32[$20>>2]|0;
    $22 = ($21|0)==($2|0);
    if (!($22)) {
     HEAP32[$19>>2] = $3;
     $24 = ((($1)) + 44|0);
     $25 = HEAP32[$24>>2]|0;
     $26 = ($25|0)==(4);
     if ($26) {
      break;
     }
     $27 = HEAP32[$10>>2]|0;
     $28 = (((($0)) + 16|0) + ($27<<3)|0);
     $29 = ((($1)) + 52|0);
     $30 = ((($1)) + 53|0);
     $$081$off0 = 0;$$084 = $15;$$085$off0 = 0;
     L29: while(1) {
      $31 = ($$084>>>0)<($28>>>0);
      if (!($31)) {
       $$283$off0 = $$081$off0;
       label = 18;
       break;
      }
      HEAP8[$29>>0] = 0;
      HEAP8[$30>>0] = 0;
      __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084,$1,$2,$2,1,$4);
      $32 = HEAP8[$13>>0]|0;
      $33 = ($32<<24>>24)==(0);
      if (!($33)) {
       $$283$off0 = $$081$off0;
       label = 18;
       break;
      }
      $34 = HEAP8[$30>>0]|0;
      $35 = ($34<<24>>24)==(0);
      do {
       if ($35) {
        $$182$off0 = $$081$off0;$$186$off0 = $$085$off0;
       } else {
        $36 = HEAP8[$29>>0]|0;
        $37 = ($36<<24>>24)==(0);
        if ($37) {
         $43 = HEAP32[$14>>2]|0;
         $44 = $43 & 1;
         $45 = ($44|0)==(0);
         if ($45) {
          $$283$off0 = 1;
          label = 18;
          break L29;
         } else {
          $$182$off0 = 1;$$186$off0 = $$085$off0;
          break;
         }
        }
        $38 = HEAP32[$11>>2]|0;
        $39 = ($38|0)==(1);
        if ($39) {
         label = 23;
         break L29;
        }
        $40 = HEAP32[$14>>2]|0;
        $41 = $40 & 2;
        $42 = ($41|0)==(0);
        if ($42) {
         label = 23;
         break L29;
        } else {
         $$182$off0 = 1;$$186$off0 = 1;
        }
       }
      } while(0);
      $46 = ((($$084)) + 8|0);
      $$081$off0 = $$182$off0;$$084 = $46;$$085$off0 = $$186$off0;
     }
     do {
      if ((label|0) == 18) {
       if (!($$085$off0)) {
        HEAP32[$20>>2] = $2;
        $47 = ((($1)) + 40|0);
        $48 = HEAP32[$47>>2]|0;
        $49 = (($48) + 1)|0;
        HEAP32[$47>>2] = $49;
        $50 = HEAP32[$12>>2]|0;
        $51 = ($50|0)==(1);
        if ($51) {
         $52 = HEAP32[$11>>2]|0;
         $53 = ($52|0)==(2);
         if ($53) {
          HEAP8[$13>>0] = 1;
          if ($$283$off0) {
           label = 23;
           break;
          } else {
           $54 = 4;
           break;
          }
         }
        }
       }
       if ($$283$off0) {
        label = 23;
       } else {
        $54 = 4;
       }
      }
     } while(0);
     if ((label|0) == 23) {
      $54 = 3;
     }
     HEAP32[$24>>2] = $54;
     break;
    }
   }
   $23 = ($3|0)==(1);
   if ($23) {
    HEAP32[$19>>2] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$5,0)|0);
 L1: do {
  if ($6) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
  } else {
   $7 = ((($0)) + 16|0);
   $8 = ((($0)) + 12|0);
   $9 = HEAP32[$8>>2]|0;
   $10 = (((($0)) + 16|0) + ($9<<3)|0);
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($7,$1,$2,$3);
   $11 = ($9|0)>(1);
   if ($11) {
    $12 = ((($0)) + 24|0);
    $13 = ((($1)) + 54|0);
    $$0 = $12;
    while(1) {
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0,$1,$2,$3);
     $14 = HEAP8[$13>>0]|0;
     $15 = ($14<<24>>24)==(0);
     if (!($15)) {
      break L1;
     }
     $16 = ((($$0)) + 8|0);
     $17 = ($16>>>0)<($10>>>0);
     if ($17) {
      $$0 = $16;
     } else {
      break;
     }
    }
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $5 >> 8;
 $7 = $5 & 1;
 $8 = ($7|0)==(0);
 if ($8) {
  $$0 = $6;
 } else {
  $9 = HEAP32[$2>>2]|0;
  $10 = (($9) + ($6)|0);
  $11 = HEAP32[$10>>2]|0;
  $$0 = $11;
 }
 $12 = HEAP32[$0>>2]|0;
 $13 = HEAP32[$12>>2]|0;
 $14 = ((($13)) + 28|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = (($2) + ($$0)|0);
 $17 = $5 & 2;
 $18 = ($17|0)!=(0);
 $19 = $18 ? $3 : 2;
 FUNCTION_TABLE_viiii[$15 & 127]($12,$1,$16,$19);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($0)) + 4|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = $7 >> 8;
 $9 = $7 & 1;
 $10 = ($9|0)==(0);
 if ($10) {
  $$0 = $8;
 } else {
  $11 = HEAP32[$3>>2]|0;
  $12 = (($11) + ($8)|0);
  $13 = HEAP32[$12>>2]|0;
  $$0 = $13;
 }
 $14 = HEAP32[$0>>2]|0;
 $15 = HEAP32[$14>>2]|0;
 $16 = ((($15)) + 20|0);
 $17 = HEAP32[$16>>2]|0;
 $18 = (($3) + ($$0)|0);
 $19 = $7 & 2;
 $20 = ($19|0)!=(0);
 $21 = $20 ? $4 : 2;
 FUNCTION_TABLE_viiiiii[$17 & 31]($14,$1,$2,$18,$21,$5);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($0)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $6 >> 8;
 $8 = $6 & 1;
 $9 = ($8|0)==(0);
 if ($9) {
  $$0 = $7;
 } else {
  $10 = HEAP32[$2>>2]|0;
  $11 = (($10) + ($7)|0);
  $12 = HEAP32[$11>>2]|0;
  $$0 = $12;
 }
 $13 = HEAP32[$0>>2]|0;
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($14)) + 24|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = (($2) + ($$0)|0);
 $18 = $6 & 2;
 $19 = ($18|0)!=(0);
 $20 = $19 ? $3 : 2;
 FUNCTION_TABLE_viiiii[$16 & 31]($13,$1,$17,$20,$4);
 return;
}
function __ZNSt9bad_allocC2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (4416);
 return;
}
function __ZSt15get_new_handlerv() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[3075]|0;HEAP32[3075] = (($0+0)|0);
 $1 = $0;
 return ($1|0);
}
function ___cxa_can_catch($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = sp;
 $4 = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $4;
 $5 = HEAP32[$0>>2]|0;
 $6 = ((($5)) + 16|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (FUNCTION_TABLE_iiii[$7 & 127]($0,$1,$3)|0);
 $9 = $8&1;
 if ($8) {
  $10 = HEAP32[$3>>2]|0;
  HEAP32[$2>>2] = $10;
 }
 STACKTOP = sp;return ($9|0);
}
function ___cxa_is_pointer_type($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  $4 = 0;
 } else {
  $2 = (___dynamic_cast($0,3424,3528,0)|0);
  $phitmp = ($2|0)!=(0|0);
  $4 = $phitmp;
 }
 $3 = $4&1;
 return ($3|0);
}
function runPostSets() {
}
function ___muldsi3($a, $b) {
    $a = $a | 0;
    $b = $b | 0;
    var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
    $1 = $a & 65535;
    $2 = $b & 65535;
    $3 = Math_imul($2, $1) | 0;
    $6 = $a >>> 16;
    $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0;
    $11 = $b >>> 16;
    $12 = Math_imul($11, $1) | 0;
    return (tempRet0 = (($8 >>> 16) + (Math_imul($11, $6) | 0) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, 0 | ($8 + $12 << 16 | $3 & 65535)) | 0;
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0, $2 = 0;
    $x_sroa_0_0_extract_trunc = $a$0;
    $y_sroa_0_0_extract_trunc = $b$0;
    $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0;
    $1$1 = tempRet0;
    $2 = Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0;
    return (tempRet0 = ((Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $2 | 0) + $1$1 | $1$1 & 0, 0 | $1$0 & -1) | 0;
}
function _i64Add(a, b, c, d) {
    /*
      x = a + b*2^32
      y = c + d*2^32
      result = l + h*2^32
    */
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a + c)>>>0;
    h = (b + d + (((l>>>0) < (a>>>0))|0))>>>0; // Add carry from low word to high word on overflow.
    return ((tempRet0 = h,l|0)|0);
}
function _i64Subtract(a, b, c, d) {
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a - c)>>>0;
    h = (b - d)>>>0;
    h = (b - d - (((c>>>0) > (a>>>0))|0))>>>0; // Borrow one from high word to low word on underflow.
    return ((tempRet0 = h,l|0)|0);
}
function _llvm_cttz_i32(x) {
    x = x|0;
    var ret = 0;
    ret = ((HEAP8[(((cttz_i8)+(x & 0xff))>>0)])|0);
    if ((ret|0) < 8) return ret|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 8)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 8)|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 16)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 16)|0;
    return (((HEAP8[(((cttz_i8)+(x >>> 24))>>0)])|0) + 24)|0;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    $rem = $rem | 0;
    var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $49 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $86 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $117 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $147 = 0, $149 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $152 = 0, $154$0 = 0, $r_sroa_0_0_extract_trunc = 0, $r_sroa_1_4_extract_trunc = 0, $155 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $q_sroa_0_0_insert_insert77$1 = 0, $_0$0 = 0, $_0$1 = 0;
    $n_sroa_0_0_extract_trunc = $a$0;
    $n_sroa_1_4_extract_shift$0 = $a$1;
    $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0;
    $d_sroa_0_0_extract_trunc = $b$0;
    $d_sroa_1_4_extract_shift$0 = $b$1;
    $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0;
    if (($n_sroa_1_4_extract_trunc | 0) == 0) {
      $4 = ($rem | 0) != 0;
      if (($d_sroa_1_4_extract_trunc | 0) == 0) {
        if ($4) {
          HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
          HEAP32[$rem + 4 >> 2] = 0;
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$4) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
    }
    $17 = ($d_sroa_1_4_extract_trunc | 0) == 0;
    do {
      if (($d_sroa_0_0_extract_trunc | 0) == 0) {
        if ($17) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
            HEAP32[$rem + 4 >> 2] = 0;
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        if (($n_sroa_0_0_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0;
            HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0);
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $37 = $d_sroa_1_4_extract_trunc - 1 | 0;
        if (($37 & $d_sroa_1_4_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0 | $a$0 & -1;
            HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0;
          }
          $_0$1 = 0;
          $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0);
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $49 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
        $51 = $49 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        if ($51 >>> 0 <= 30) {
          $57 = $51 + 1 | 0;
          $58 = 31 - $51 | 0;
          $sr_1_ph = $57;
          $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0);
          $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0);
          $q_sroa_0_1_ph = 0;
          $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58;
          break;
        }
        if (($rem | 0) == 0) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = 0 | $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$17) {
          $117 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
          $119 = $117 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          if ($119 >>> 0 <= 31) {
            $125 = $119 + 1 | 0;
            $126 = 31 - $119 | 0;
            $130 = $119 - 31 >> 31;
            $sr_1_ph = $125;
            $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126;
            $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130;
            $q_sroa_0_1_ph = 0;
            $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126;
            break;
          }
          if (($rem | 0) == 0) {
            $_0$1 = 0;
            $_0$0 = 0;
            return (tempRet0 = $_0$1, $_0$0) | 0;
          }
          HEAP32[$rem >> 2] = 0 | $a$0 & -1;
          HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $66 = $d_sroa_0_0_extract_trunc - 1 | 0;
        if (($66 & $d_sroa_0_0_extract_trunc | 0) != 0) {
          $86 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 | 0;
          $88 = $86 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          $89 = 64 - $88 | 0;
          $91 = 32 - $88 | 0;
          $92 = $91 >> 31;
          $95 = $88 - 32 | 0;
          $105 = $95 >> 31;
          $sr_1_ph = $88;
          $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105;
          $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0);
          $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92;
          $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31;
          break;
        }
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc;
          HEAP32[$rem + 4 >> 2] = 0;
        }
        if (($d_sroa_0_0_extract_trunc | 0) == 1) {
          $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$0 = 0 | $a$0 & -1;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        } else {
          $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0;
          $_0$1 = 0 | $n_sroa_1_4_extract_trunc >>> ($78 >>> 0);
          $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
      }
    } while (0);
    if (($sr_1_ph | 0) == 0) {
      $q_sroa_1_1_lcssa = $q_sroa_1_1_ph;
      $q_sroa_0_1_lcssa = $q_sroa_0_1_ph;
      $r_sroa_1_1_lcssa = $r_sroa_1_1_ph;
      $r_sroa_0_1_lcssa = $r_sroa_0_1_ph;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = 0;
    } else {
      $d_sroa_0_0_insert_insert99$0 = 0 | $b$0 & -1;
      $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0;
      $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0;
      $137$1 = tempRet0;
      $q_sroa_1_1198 = $q_sroa_1_1_ph;
      $q_sroa_0_1199 = $q_sroa_0_1_ph;
      $r_sroa_1_1200 = $r_sroa_1_1_ph;
      $r_sroa_0_1201 = $r_sroa_0_1_ph;
      $sr_1202 = $sr_1_ph;
      $carry_0203 = 0;
      while (1) {
        $147 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1;
        $149 = $carry_0203 | $q_sroa_0_1199 << 1;
        $r_sroa_0_0_insert_insert42$0 = 0 | ($r_sroa_0_1201 << 1 | $q_sroa_1_1198 >>> 31);
        $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0;
        _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0;
        $150$1 = tempRet0;
        $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1;
        $152 = $151$0 & 1;
        $154$0 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0;
        $r_sroa_0_0_extract_trunc = $154$0;
        $r_sroa_1_4_extract_trunc = tempRet0;
        $155 = $sr_1202 - 1 | 0;
        if (($155 | 0) == 0) {
          break;
        } else {
          $q_sroa_1_1198 = $147;
          $q_sroa_0_1199 = $149;
          $r_sroa_1_1200 = $r_sroa_1_4_extract_trunc;
          $r_sroa_0_1201 = $r_sroa_0_0_extract_trunc;
          $sr_1202 = $155;
          $carry_0203 = $152;
        }
      }
      $q_sroa_1_1_lcssa = $147;
      $q_sroa_0_1_lcssa = $149;
      $r_sroa_1_1_lcssa = $r_sroa_1_4_extract_trunc;
      $r_sroa_0_1_lcssa = $r_sroa_0_0_extract_trunc;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = $152;
    }
    $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa;
    $q_sroa_0_0_insert_ext75$1 = 0;
    $q_sroa_0_0_insert_insert77$1 = $q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1;
    if (($rem | 0) != 0) {
      HEAP32[$rem >> 2] = 0 | $r_sroa_0_1_lcssa;
      HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa | 0;
    }
    $_0$1 = (0 | $q_sroa_0_0_insert_ext75$0) >>> 31 | $q_sroa_0_0_insert_insert77$1 << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1;
    $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $1$0 = 0;
    $1$0 = ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0;
    return $1$0 | 0;
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $rem = 0, __stackBase__ = 0;
    __stackBase__ = STACKTOP;
    STACKTOP = STACKTOP + 16 | 0;
    $rem = __stackBase__ | 0;
    ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0;
    STACKTOP = __stackBase__;
    return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0;
}
function _bitshift64Lshr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >>> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = 0;
    return (high >>> (bits - 32))|0;
}
function _bitshift64Shl(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = (high << bits) | ((low&(ander << (32 - bits))) >>> (32 - bits));
      return low << bits;
    }
    tempRet0 = low << (bits - 32);
    return 0;
}
function _llvm_bswap_i32(x) {
    x = x|0;
    return (((x&0xff)<<24) | (((x>>8)&0xff)<<16) | (((x>>16)&0xff)<<8) | (x>>>24))|0;
}
function _llvm_ctlz_i64(l, h, isZeroUndef) {
    l = l | 0;
    h = h | 0;
    isZeroUndef = isZeroUndef | 0;
    var ret = 0;
    ret = Math_clz32(h) | 0;
    if ((ret | 0) == 32) ret = ret + (Math_clz32(l) | 0) | 0;
    tempRet0 = 0;
    return ret | 0;
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    var aligned_dest_end = 0;
    var block_aligned_dest_end = 0;
    var dest_end = 0;
    // Test against a benchmarked cutoff limit for when HEAPU8.set() becomes faster to use.
    if ((num|0) >=
      8192
    ) {
      return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    }

    ret = dest|0;
    dest_end = (dest + num)|0;
    if ((dest&3) == (src&3)) {
      // The initial unaligned < 4-byte front.
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      aligned_dest_end = (dest_end & -4)|0;
      block_aligned_dest_end = (aligned_dest_end - 64)|0;
      while ((dest|0) <= (block_aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        HEAP32[(((dest)+(4))>>2)]=((HEAP32[(((src)+(4))>>2)])|0);
        HEAP32[(((dest)+(8))>>2)]=((HEAP32[(((src)+(8))>>2)])|0);
        HEAP32[(((dest)+(12))>>2)]=((HEAP32[(((src)+(12))>>2)])|0);
        HEAP32[(((dest)+(16))>>2)]=((HEAP32[(((src)+(16))>>2)])|0);
        HEAP32[(((dest)+(20))>>2)]=((HEAP32[(((src)+(20))>>2)])|0);
        HEAP32[(((dest)+(24))>>2)]=((HEAP32[(((src)+(24))>>2)])|0);
        HEAP32[(((dest)+(28))>>2)]=((HEAP32[(((src)+(28))>>2)])|0);
        HEAP32[(((dest)+(32))>>2)]=((HEAP32[(((src)+(32))>>2)])|0);
        HEAP32[(((dest)+(36))>>2)]=((HEAP32[(((src)+(36))>>2)])|0);
        HEAP32[(((dest)+(40))>>2)]=((HEAP32[(((src)+(40))>>2)])|0);
        HEAP32[(((dest)+(44))>>2)]=((HEAP32[(((src)+(44))>>2)])|0);
        HEAP32[(((dest)+(48))>>2)]=((HEAP32[(((src)+(48))>>2)])|0);
        HEAP32[(((dest)+(52))>>2)]=((HEAP32[(((src)+(52))>>2)])|0);
        HEAP32[(((dest)+(56))>>2)]=((HEAP32[(((src)+(56))>>2)])|0);
        HEAP32[(((dest)+(60))>>2)]=((HEAP32[(((src)+(60))>>2)])|0);
        dest = (dest+64)|0;
        src = (src+64)|0;
      }
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    } else {
      // In the unaligned copy case, unroll a bit as well.
      aligned_dest_end = (dest_end - 4)|0;
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        HEAP8[(((dest)+(1))>>0)]=((HEAP8[(((src)+(1))>>0)])|0);
        HEAP8[(((dest)+(2))>>0)]=((HEAP8[(((src)+(2))>>0)])|0);
        HEAP8[(((dest)+(3))>>0)]=((HEAP8[(((src)+(3))>>0)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    }
    // The remaining unaligned < 4 byte tail.
    while ((dest|0) < (dest_end|0)) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
    }
    return ret|0;
}
function _memmove(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    if (((src|0) < (dest|0)) & ((dest|0) < ((src + num)|0))) {
      // Unlikely case: Copy backwards in a safe manner
      ret = dest;
      src = (src + num)|0;
      dest = (dest + num)|0;
      while ((num|0) > 0) {
        dest = (dest - 1)|0;
        src = (src - 1)|0;
        num = (num - 1)|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      }
      dest = ret;
    } else {
      _memcpy(dest, src, num) | 0;
    }
    return dest | 0;
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
    end = (ptr + num)|0;

    value = value & 0xff;
    if ((num|0) >= 67 /* 64 bytes for an unrolled loop + 3 bytes for unaligned head*/) {
      while ((ptr&3) != 0) {
        HEAP8[((ptr)>>0)]=value;
        ptr = (ptr+1)|0;
      }

      aligned_end = (end & -4)|0;
      block_aligned_end = (aligned_end - 64)|0;
      value4 = value | (value << 8) | (value << 16) | (value << 24);

      while((ptr|0) <= (block_aligned_end|0)) {
        HEAP32[((ptr)>>2)]=value4;
        HEAP32[(((ptr)+(4))>>2)]=value4;
        HEAP32[(((ptr)+(8))>>2)]=value4;
        HEAP32[(((ptr)+(12))>>2)]=value4;
        HEAP32[(((ptr)+(16))>>2)]=value4;
        HEAP32[(((ptr)+(20))>>2)]=value4;
        HEAP32[(((ptr)+(24))>>2)]=value4;
        HEAP32[(((ptr)+(28))>>2)]=value4;
        HEAP32[(((ptr)+(32))>>2)]=value4;
        HEAP32[(((ptr)+(36))>>2)]=value4;
        HEAP32[(((ptr)+(40))>>2)]=value4;
        HEAP32[(((ptr)+(44))>>2)]=value4;
        HEAP32[(((ptr)+(48))>>2)]=value4;
        HEAP32[(((ptr)+(52))>>2)]=value4;
        HEAP32[(((ptr)+(56))>>2)]=value4;
        HEAP32[(((ptr)+(60))>>2)]=value4;
        ptr = (ptr + 64)|0;
      }

      while ((ptr|0) < (aligned_end|0) ) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    // The remaining bytes.
    while ((ptr|0) < (end|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (end-num)|0;
}
function _sbrk(increment) {
    increment = increment|0;
    var oldDynamicTop = 0;
    var oldDynamicTopOnChange = 0;
    var newDynamicTop = 0;
    var totalMemory = 0;
    increment = ((increment + 15) & -16)|0;
    oldDynamicTop = HEAP32[DYNAMICTOP_PTR>>2]|0;
    newDynamicTop = oldDynamicTop + increment | 0;

    if (((increment|0) > 0 & (newDynamicTop|0) < (oldDynamicTop|0)) // Detect and fail if we would wrap around signed 32-bit int.
      | (newDynamicTop|0) < 0) { // Also underflow, sbrk() should be able to be used to subtract.
      abortOnCannotGrowMemory()|0;
      ___setErrNo(12);
      return -1;
    }

    HEAP32[DYNAMICTOP_PTR>>2] = newDynamicTop;
    totalMemory = getTotalMemory()|0;
    if ((newDynamicTop|0) > (totalMemory|0)) {
      if ((enlargeMemory()|0) == 0) {
        HEAP32[DYNAMICTOP_PTR>>2] = oldDynamicTop;
        ___setErrNo(12);
        return -1;
      }
    }
    return oldDynamicTop|0;
}

  
function dynCall_ddi(index,a1,a2) {
  index = index|0;
  a1=+a1; a2=a2|0;
  return +FUNCTION_TABLE_ddi[index&127](+a1,a2|0);
}


function dynCall_i(index) {
  index = index|0;
  
  return FUNCTION_TABLE_i[index&127]()|0;
}


function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&127](a1|0)|0;
}


function dynCall_iid(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=+a2;
  return FUNCTION_TABLE_iid[index&127](a1|0,+a2)|0;
}


function dynCall_iii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  return FUNCTION_TABLE_iii[index&127](a1|0,a2|0)|0;
}


function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&127](a1|0,a2|0,a3|0)|0;
}


function dynCall_iiiii(index,a1,a2,a3,a4) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0;
  return FUNCTION_TABLE_iiiii[index&127](a1|0,a2|0,a3|0,a4|0)|0;
}


function dynCall_v(index) {
  index = index|0;
  
  FUNCTION_TABLE_v[index&127]();
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&127](a1|0);
}


function dynCall_vii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  FUNCTION_TABLE_vii[index&127](a1|0,a2|0);
}


function dynCall_viii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  FUNCTION_TABLE_viii[index&127](a1|0,a2|0,a3|0);
}


function dynCall_viiii(index,a1,a2,a3,a4) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0;
  FUNCTION_TABLE_viiii[index&127](a1|0,a2|0,a3|0,a4|0);
}


function dynCall_viiiii(index,a1,a2,a3,a4,a5) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0;
  FUNCTION_TABLE_viiiii[index&31](a1|0,a2|0,a3|0,a4|0,a5|0);
}


function dynCall_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0;
  FUNCTION_TABLE_viiiiii[index&31](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0);
}

function b0(p0,p1) {
 p0 = +p0;p1 = p1|0; nullFunc_ddi(0);return +0;
}
function b1() {
 ; nullFunc_i(1);return 0;
}
function b2(p0) {
 p0 = p0|0; nullFunc_ii(2);return 0;
}
function b3(p0,p1) {
 p0 = p0|0;p1 = +p1; nullFunc_iid(3);return 0;
}
function b4(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_iii(4);return 0;
}
function b5(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(5);return 0;
}
function b6(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; nullFunc_iiiii(6);return 0;
}
function b7() {
 ; nullFunc_v(7);
}
function ___cxa_end_catch__wrapper() {
 ; ___cxa_end_catch();
}
function b8(p0) {
 p0 = p0|0; nullFunc_vi(8);
}
function b9(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_vii(9);
}
function b10(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_viii(10);
}
function b11(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; nullFunc_viiii(11);
}
function ___assert_fail__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; ___assert_fail(p0|0,p1|0,p2|0,p3|0);
}
function b12(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; nullFunc_viiiii(12);
}
function b13(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; nullFunc_viiiiii(13);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ddi = [b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,__ZN9rapidjson8internal21StrtodNormalPrecisionEdi,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0];
var FUNCTION_TABLE_i = [b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,___cxa_get_globals_fast,b1,b1];
var FUNCTION_TABLE_ii = [b2,___stdio_close,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,__ZNKSt9bad_alloc4whatEv,b2,b2,__ZNKSt11logic_error4whatEv,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,__Znwj,b2,b2,b2,b2,b2,__ZNK9rapidjson19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEE9GetStringEv,b2,__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E12GetAllocatorEv,b2,b2,b2,b2,b2,__ZN10emscripten8internal13getActualTypeI6MyJsonEEPKvPT_,b2,__ZN10emscripten8internal12operator_newI6MyJsonJRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEEEEPT_DpOT0_,b2,b2,b2,__ZN6MyJson9GetSupplyEv
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,__ZNK9rapidjson8internal5StackINS_12CrtAllocatorEE7GetSizeEv,b2,b2,__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13HasParseErrorEv,__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4PeekEv,__ZNK9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TellEv,b2,b2,__ZNK9rapidjson11ParseResult7IsErrorEv,b2,b2
,__ZN9rapidjson19GenericStringStreamINS_4UTF8IcEEE4TakeEv,b2,b2,__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE6LengthEv,__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcE3PopEv,b2,b2,b2,__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EE4TellEv,b2,__ZNK9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EE4PeekEv,__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EE8TakePushEv,__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EE6LengthEv,__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EE4TakeEv,__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EE3PopEv,b2,b2,b2,b2,b2,b2,b2,__ZNK9rapidjson16GenericStringRefIcEcvPKcEv,b2,b2,b2,b2,__ZN10emscripten8internal11BindingTypeIP6MyJsonE10toWireTypeES3_,__ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE10toWireTypeERKS8_,__ZN10emscripten8internal11BindingTypeIiE10toWireTypeERKi
,__ZN10emscripten8internal11BindingTypeIiE12fromWireTypeEi,b2,b2,b2,b2,b2,b2,b2,b2];
var FUNCTION_TABLE_iid = [b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E6DoubleEd,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3];
var FUNCTION_TABLE_iii = [b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E5ParseEPKc,__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9HasMemberEPKc,__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEixIKcEENS_8internal9DisableIfINS9_15RemoveSfinaeTagIPFRNS9_9SfinaeTagENS9_7NotExprINS9_6IsSameINS9_11RemoveConstIT_E4TypeEcEEEEEE4TypeERS6_E4TypeEPSH_,b4,b4,b4,b4,__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEEixIS5_EERS6_RKNS0_IS2_T_EE,b4,b4,__ZNK9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE6AcceptINS_6WriterINS_19GenericStringBufferIS2_S4_EES2_S2_S4_Lj0EEEEEbRT_,b4,b4,b4,b4,__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE6SetIntEi,b4,b4,b4,b4,b4,b4,__ZN10emscripten8internal7InvokerIP6MyJsonJRKNSt3__212basic_stringIcNS4_11char_traitsIcEENS4_9allocatorIcEEEEEE6invokeEPFS3_SC_EPNS0_11BindingTypeISA_EUt_E,b4,__ZN10emscripten8internal13MethodInvokerIM6MyJsonFNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEvES9_PS2_JEE6invokeERKSB_SC_,b4
,__ZN10emscripten8internal13MethodInvokerIM6MyJsonFivEiPS2_JEE6invokeERKS4_S5_,__ZN6MyJson6GetMapERKNSt3__212basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEE,b4,__ZN6MyJson7GetMap2ERKNSt3__212basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEE,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE3PopINS_12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorIS2_EEEEEEPT_j,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4,__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE7ConsumeINS4_12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EEEEEbRT_NSA_2ChE,b4,b4,b4,b4,b4,b4,b4,b4,b4,__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E3IntEi,__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E4UintEj,b4,b4,__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE16SetStringPointerEPKc,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4];
var FUNCTION_TABLE_iiii = [b5,b5,___stdio_write,___stdio_seek,___stdout_write,b5,b5,b5,b5,b5,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,__ZNK10__cxxabiv123__fundamental_type_info9can_catchEPKNS_16__shim_type_infoERPv,b5,__ZNK10__cxxabiv119__pointer_type_info9can_catchEPKNS_16__shim_type_infoERPv
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,__ZN10emscripten8internal13MethodInvokerIM6MyJsonFiRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEEiPS2_JSB_EE6invokeERKSD_SE_PNS0_11BindingTypeIS9_EUt_E,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E5Int64Ex,__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E6Uint64Ey,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5];
var FUNCTION_TABLE_iiiii = [b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9SetStringEPKcjRS5_,b6,__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE9AddMemberERS6_S7_RS5_,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E3KeyEPKcjb,__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E6StringEPKcjb,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6];
var FUNCTION_TABLE_v = [b7,b7,b7,b7,b7,__ZL25default_terminate_handlerv,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b7,b7,b7,___cxa_end_catch__wrapper];
var FUNCTION_TABLE_vi = [b8,b8,b8,b8,b8,b8,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,b8,b8,b8,b8,__ZN10__cxxabiv120__si_class_type_infoD0Ev,b8,b8,b8,__ZNSt9bad_allocD2Ev,__ZNSt9bad_allocD0Ev,b8,__ZNSt11logic_errorD2Ev,__ZNSt11logic_errorD0Ev,b8,__ZNSt12length_errorD0Ev,__ZN10__cxxabiv123__fundamental_type_infoD0Ev,b8,__ZN10__cxxabiv119__pointer_type_infoD0Ev,b8
,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,b8,b8,b8,b8,b8,b8,b8,__ZN9rapidjson11ParseResultC2Ev,b8,b8,b8,__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E7DestroyEv,b8,b8,b8,__ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv,b8,b8,b8,b8,b8,b8,b8,__ZN10emscripten8internal14raw_destructorI6MyJsonEEvPT_,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,__ZN9rapidjson8internal5StackINS_12CrtAllocatorEE7DestroyEv,__ZN9rapidjson19MemoryPoolAllocatorINS_12CrtAllocatorEE5ClearEv,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E10ClearStackEv,__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE10ClearStackEv
,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,b8,b8,b8];
var FUNCTION_TABLE_vii = [b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE11ShortString9SetLengthEj,b9,b9,b9,b9,__ZN6MyJson7GetNameEv,b9,b9
,b9,b9,b9,b9,__ZN6MyJson9GetMyJsonEv,__ZN6MyJson7SetNameERKNSt3__212basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEE,b9,__ZN6MyJson9SetSupplyERKi,b9,b9,b9,b9,b9,__ZN6MyJson9Add_ArrayERKNSt3__212basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEE,b9,b9,__ZN9rapidjson15GenericDocumentINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEES4_E16ClearStackOnExitC2ERS6_,b9,__ZNK9rapidjson11ParseResultcvMS0_KFbvEEv,b9,b9,__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE25SkipWhitespaceAndCommentsILj0ENS_19GenericStringStreamIS2_EEEEvRT0_,b9,b9,b9,b9,b9,b9,b9,b9
,b9,__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE11StackStreamIcEC2ERNS_8internal5StackIS3_EE,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,__ZN9rapidjson16GenericStringRefIcEC2ERKS1_,__ZN6MyJsonC2ERKNSt3__212basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEE,b9,b9,b9
,b9,__ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE12fromWireTypeEPNS9_Ut_E,__ZNSt3__218__libcpp_refstringC2EPKc,__ZNSt11logic_errorC2EPKc,b9,b9,b9,_abort_message,b9];
var FUNCTION_TABLE_viii = [b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10
,b10,b10,b10,b10,b10,b10,b10,__ZN9rapidjson8internal5StackINS_12CrtAllocatorEEC2EPS2_j,b10,b10,__ZN9rapidjson19MemoryPoolAllocatorINS_12CrtAllocatorEEC2EjPS1_,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10
,b10,b10,b10,b10,b10,b10,__ZN10emscripten8internal13MethodInvokerIM6MyJsonFvRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEEvPS2_JSB_EE6invokeERKSD_SE_PNS0_11BindingTypeIS9_EUt_E,b10,__ZN10emscripten8internal13MethodInvokerIM6MyJsonFvRKiEvPS2_JS4_EE6invokeERKS6_S7_i,__ZN6MyJson10Add_KeyIntERKNSt3__212basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEERKi,b10,__ZN6MyJson13Add_KeyStringERKNSt3__212basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEES8_,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE13SetParseErrorENS_14ParseErrorCodeEj,__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE10ParseValueILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEEvRT0_RT1_,b10,b10,b10
,b10,b10,__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE19ParseStringToStreamILj0ES2_S2_NS_19GenericStringStreamIS2_EENS4_11StackStreamIcEEEEvRT2_RT3_,b10,b10,b10,b10,__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE12NumberStreamINS_19GenericStringStreamIS2_EELb0ELb0EEC2ERS4_RS7_,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,__ZN9rapidjson9StringRefIcEENS_16GenericStringRefIT_EEPKS2_j,b10,b10,__ZN9rapidjson12GenericValueINS_4UTF8IcEENS_19MemoryPoolAllocatorINS_12CrtAllocatorEEEE10FindMemberIS5_EENS_21GenericMemberIteratorILb0ES2_S5_EERKNS0_IS2_T_EE,b10,b10,b10,b10,b10
,b10,b10,b10,b10,b10,b10,b10,b10,b10];
var FUNCTION_TABLE_viiii = [b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b11,b11,b11,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11
,b11,b11,b11,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b11,b11,b11,b11,b11,b11,b11,b11,b11,__ZN9rapidjson6WriterINS_19GenericStringBufferINS_4UTF8IcEENS_12CrtAllocatorEEES3_S3_S4_Lj0EEC2ERS5_PS4_j,b11,b11,b11,b11,b11,b11,b11,___assert_fail__wrapper,b11,b11,b11,b11,b11,b11,b11,b11
,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,__ZN10emscripten8internal13MethodInvokerIM6MyJsonFvRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEERKiEvPS2_JSB_SD_EE6invokeERKSF_SG_PNS0_11BindingTypeIS9_EUt_Ei,b11,__ZN10emscripten8internal13MethodInvokerIM6MyJsonFvRKNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEESB_EvPS2_JSB_SB_EE6invokeERKSD_SE_PNS0_11BindingTypeIS9_EUt_ESL_,b11,b11,b11,b11,__ZN9rapidjson13GenericReaderINS_4UTF8IcEES2_NS_12CrtAllocatorEE5ParseILj0ENS_19GenericStringStreamIS2_EENS_15GenericDocumentIS2_NS_19MemoryPoolAllocatorIS3_EES3_EEEENS_11ParseResultERT0_RT1_,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11
,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11
,b11,b11,b11,b11,b11,b11,b11,b11,b11];
var FUNCTION_TABLE_viiiii = [b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b12,b12,b12,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12
,b12,b12,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b13,b13,b13,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13,b13
,b13,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b13];

  return { __GLOBAL__sub_I_bind_cpp: __GLOBAL__sub_I_bind_cpp, __GLOBAL__sub_I_json_handler_cpp: __GLOBAL__sub_I_json_handler_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___getTypeName: ___getTypeName, ___muldi3: ___muldi3, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_get_global_libc: _emscripten_get_global_libc, _fflush: _fflush, _free: _free, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _llvm_bswap_i32: _llvm_bswap_i32, _llvm_ctlz_i64: _llvm_ctlz_i64, _malloc: _malloc, _memcpy: _memcpy, _memmove: _memmove, _memset: _memset, _sbrk: _sbrk, dynCall_ddi: dynCall_ddi, dynCall_i: dynCall_i, dynCall_ii: dynCall_ii, dynCall_iid: dynCall_iid, dynCall_iii: dynCall_iii, dynCall_iiii: dynCall_iiii, dynCall_iiiii: dynCall_iiiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_viii: dynCall_viii, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real___GLOBAL__sub_I_bind_cpp = asm["__GLOBAL__sub_I_bind_cpp"]; asm["__GLOBAL__sub_I_bind_cpp"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real___GLOBAL__sub_I_bind_cpp.apply(null, arguments);
};

var real___GLOBAL__sub_I_json_handler_cpp = asm["__GLOBAL__sub_I_json_handler_cpp"]; asm["__GLOBAL__sub_I_json_handler_cpp"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real___GLOBAL__sub_I_json_handler_cpp.apply(null, arguments);
};

var real____cxa_can_catch = asm["___cxa_can_catch"]; asm["___cxa_can_catch"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_can_catch.apply(null, arguments);
};

var real____cxa_is_pointer_type = asm["___cxa_is_pointer_type"]; asm["___cxa_is_pointer_type"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_is_pointer_type.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____errno_location.apply(null, arguments);
};

var real____getTypeName = asm["___getTypeName"]; asm["___getTypeName"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____getTypeName.apply(null, arguments);
};

var real____muldi3 = asm["___muldi3"]; asm["___muldi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____muldi3.apply(null, arguments);
};

var real____udivdi3 = asm["___udivdi3"]; asm["___udivdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____udivdi3.apply(null, arguments);
};

var real____uremdi3 = asm["___uremdi3"]; asm["___uremdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____uremdi3.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Lshr.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Shl.apply(null, arguments);
};

var real__emscripten_get_global_libc = asm["_emscripten_get_global_libc"]; asm["_emscripten_get_global_libc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__emscripten_get_global_libc.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__fflush.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__free.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Add.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Subtract.apply(null, arguments);
};

var real__llvm_bswap_i32 = asm["_llvm_bswap_i32"]; asm["_llvm_bswap_i32"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__llvm_bswap_i32.apply(null, arguments);
};

var real__llvm_ctlz_i64 = asm["_llvm_ctlz_i64"]; asm["_llvm_ctlz_i64"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__llvm_ctlz_i64.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__malloc.apply(null, arguments);
};

var real__memmove = asm["_memmove"]; asm["_memmove"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__memmove.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__sbrk.apply(null, arguments);
};

var real_establishStackSpace = asm["establishStackSpace"]; asm["establishStackSpace"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_establishStackSpace.apply(null, arguments);
};

var real_getTempRet0 = asm["getTempRet0"]; asm["getTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_getTempRet0.apply(null, arguments);
};

var real_setTempRet0 = asm["setTempRet0"]; asm["setTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setTempRet0.apply(null, arguments);
};

var real_setThrew = asm["setThrew"]; asm["setThrew"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setThrew.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"]; asm["stackAlloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackAlloc.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"]; asm["stackRestore"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackRestore.apply(null, arguments);
};

var real_stackSave = asm["stackSave"]; asm["stackSave"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackSave.apply(null, arguments);
};
var __GLOBAL__sub_I_bind_cpp = Module["__GLOBAL__sub_I_bind_cpp"] = asm["__GLOBAL__sub_I_bind_cpp"];
var __GLOBAL__sub_I_json_handler_cpp = Module["__GLOBAL__sub_I_json_handler_cpp"] = asm["__GLOBAL__sub_I_json_handler_cpp"];
var ___cxa_can_catch = Module["___cxa_can_catch"] = asm["___cxa_can_catch"];
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var ___getTypeName = Module["___getTypeName"] = asm["___getTypeName"];
var ___muldi3 = Module["___muldi3"] = asm["___muldi3"];
var ___udivdi3 = Module["___udivdi3"] = asm["___udivdi3"];
var ___uremdi3 = Module["___uremdi3"] = asm["___uremdi3"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var _emscripten_get_global_libc = Module["_emscripten_get_global_libc"] = asm["_emscripten_get_global_libc"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var _free = Module["_free"] = asm["_free"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
var _llvm_ctlz_i64 = Module["_llvm_ctlz_i64"] = asm["_llvm_ctlz_i64"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _memmove = Module["_memmove"] = asm["_memmove"];
var _memset = Module["_memset"] = asm["_memset"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var getTempRet0 = Module["getTempRet0"] = asm["getTempRet0"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var setTempRet0 = Module["setTempRet0"] = asm["setTempRet0"];
var setThrew = Module["setThrew"] = asm["setThrew"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var stackSave = Module["stackSave"] = asm["stackSave"];
var dynCall_ddi = Module["dynCall_ddi"] = asm["dynCall_ddi"];
var dynCall_i = Module["dynCall_i"] = asm["dynCall_i"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_iid = Module["dynCall_iid"] = asm["dynCall_iid"];
var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_iiiii = Module["dynCall_iiiii"] = asm["dynCall_iiiii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_viii = Module["dynCall_viii"] = asm["dynCall_viii"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
;
Runtime.stackAlloc = Module['stackAlloc'];
Runtime.stackSave = Module['stackSave'];
Runtime.stackRestore = Module['stackRestore'];
Runtime.establishStackSpace = Module['establishStackSpace'];
Runtime.setTempRet0 = Module['setTempRet0'];
Runtime.getTempRet0 = Module['getTempRet0'];


// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;




if (memoryInitializer) {
  if (typeof Module['locateFile'] === 'function') {
    memoryInitializer = Module['locateFile'](memoryInitializer);
  } else if (Module['memoryInitializerPrefixURL']) {
    memoryInitializer = Module['memoryInitializerPrefixURL'] + memoryInitializer;
  }
  if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
    var data = Module['readBinary'](memoryInitializer);
    HEAPU8.set(data, Runtime.GLOBAL_BASE);
  } else {
    addRunDependency('memory initializer');
    var applyMemoryInitializer = function(data) {
      if (data.byteLength) data = new Uint8Array(data);
      for (var i = 0; i < data.length; i++) {
        assert(HEAPU8[Runtime.GLOBAL_BASE + i] === 0, "area for memory initializer should not have been touched before it's loaded");
      }
      HEAPU8.set(data, Runtime.GLOBAL_BASE);
      // Delete the typed array that contains the large blob of the memory initializer request response so that
      // we won't keep unnecessary memory lying around. However, keep the XHR object itself alive so that e.g.
      // its .status field can still be accessed later.
      if (Module['memoryInitializerRequest']) delete Module['memoryInitializerRequest'].response;
      removeRunDependency('memory initializer');
    }
    function doBrowserLoad() {
      Module['readAsync'](memoryInitializer, applyMemoryInitializer, function() {
        throw 'could not load memory initializer ' + memoryInitializer;
      });
    }
    var memoryInitializerBytes = tryParseAsDataURI(memoryInitializer);
    if (memoryInitializerBytes) {
      applyMemoryInitializer(memoryInitializerBytes.buffer);
    } else
    if (Module['memoryInitializerRequest']) {
      // a network request has already been created, just use that
      function useRequest() {
        var request = Module['memoryInitializerRequest'];
        var response = request.response;
        if (request.status !== 200 && request.status !== 0) {
          var data = tryParseAsDataURI(Module['memoryInitializerRequestURL']);
          if (data) {
            response = data.buffer;
          } else {
            // If you see this warning, the issue may be that you are using locateFile or memoryInitializerPrefixURL, and defining them in JS. That
            // means that the HTML file doesn't know about them, and when it tries to create the mem init request early, does it to the wrong place.
            // Look in your browser's devtools network console to see what's going on.
            console.warn('a problem seems to have happened with Module.memoryInitializerRequest, status: ' + request.status + ', retrying ' + memoryInitializer);
            doBrowserLoad();
            return;
          }
        }
        applyMemoryInitializer(response);
      }
      if (Module['memoryInitializerRequest'].response) {
        setTimeout(useRequest, 0); // it's already here; but, apply it asynchronously
      } else {
        Module['memoryInitializerRequest'].addEventListener('load', useRequest); // wait for it
      }
    } else {
      // fetch it from the network ourselves
      doBrowserLoad();
    }
  }
}



/**
 * @constructor
 * @extends {Error}
 * @this {ExitStatus}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var preloadStartTime = null;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = Module.callMain = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  function pad() {
    for (var i = 0; i < 4-1; i++) {
      argv.push(0);
    }
  }
  var argv = [allocate(intArrayFromString(Module['thisProgram']), 'i8', ALLOC_NORMAL) ];
  pad();
  for (var i = 0; i < argc-1; i = i + 1) {
    argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_NORMAL));
    pad();
  }
  argv.push(0);
  argv = allocate(argv, 'i32', ALLOC_NORMAL);


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
    exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      var toLog = e;
      if (e && typeof e === 'object' && e.stack) {
        toLog = [e, e.stack];
      }
      Module.printErr('exception thrown: ' + toLog);
      Module['quit'](1, e);
    }
  } finally {
    calledMain = true;
  }
}




/** @type {function(Array=)} */
function run(args) {
  args = args || Module['arguments'];

  if (preloadStartTime === null) preloadStartTime = Date.now();

  if (runDependencies > 0) {
    return;
  }

  writeStackCookie();

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (ENVIRONMENT_IS_WEB && preloadStartTime !== null) {
      Module.printErr('pre-main prep time: ' + (Date.now() - preloadStartTime) + ' ms');
    }

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = Module.run = run;

function exit(status, implicit) {
  if (implicit && Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') implicitly called by end of main(), but noExitRuntime, so not exiting the runtime (you can use emscripten_force_exit, if you want to force a true shutdown)');
    return;
  }

  if (Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') called, but noExitRuntime, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)');
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  }
  Module['quit'](status, new ExitStatus(status));
}
Module['exit'] = Module.exit = exit;

var abortDecorators = [];

function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';

  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = Module.abort = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}


run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}




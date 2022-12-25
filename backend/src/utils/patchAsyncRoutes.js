/*
Original work Copyright (c) 2016, Nikolay Nemshilov <nemshilov@gmail.com>
Modified work Copyright (c) 2016, David Banham <david@banham.id.au>

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.

*/

/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-env node */
const Layer = require('express/lib/router/layer');
const Router = require('express/lib/router');

const last = (arr = []) => arr[arr.length - 1];
const noop = Function.prototype;

function copyFnProps(oldFn, newFn) {
  Object.keys(oldFn).forEach((key) => {
    newFn[key] = oldFn[key];
  });
  return newFn;
}

function wrap(fn) {
  const newFn = function newFn(...args) {
    const ret = fn.apply(this, args);
    const next = (args.length === 5 ? args[2] : last(args)) || noop;
    if (ret && ret.catch) ret.catch(err => next(err));
    return ret;
  };
  Object.defineProperty(newFn, 'length', {
    value: fn.length,
    writable: false,
  });
  return copyFnProps(fn, newFn);
}

export function patchRouterParam() {
  const originalParam = Router.prototype.constructor.param;
  Router.prototype.constructor.param = function param(name, fn) {
    fn = wrap(fn);
    return originalParam.call(this, name, fn);
  };
}

Object.defineProperty(Layer.prototype, 'handle', {
  enumerable: true,
  get() {
    return this.__handle;
  },
  set(fn) {
    fn = wrap(fn);
    this.__handle = fn;
  },
});
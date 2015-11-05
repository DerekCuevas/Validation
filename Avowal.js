/**
 * Avowal - small async form validation framework
 * @author Derek Cuevas
 */

(function () {
    'use strict';

    var root = this;

    function forEvery(obj, fun) {
        Object.keys(obj).forEach(function (key) {
            fun(key, obj[key]);
        });
    }

    function asyncForEvery(obj, fun, done) {
        var keys = Object.keys(obj);
        var count = 0;

        keys.forEach(function (key) {
            fun(key, obj[key], function () {
                count += 1;
                if (count === keys.length) {
                    done();
                }
            });
        });
    }

    function render(template, obj) {
        return template.replace(/\{\{(.+?)\}\}/g, function (_, prop) {
            return obj[prop];
        });
    }

    function fail(thing) {
        throw new Error('Avowal Error => ' + thing);
    }

    /**
     * Constructor function
     *
     * required options:
     *     name (form name attribute)
     *
     * optional options:
     *     on (validation event),
     *     templates ('handlebars like' placeholder for form messages)
     *
     * @param {Object} options
     */
    function Avowal(options) {
        var opts = options || {};
        opts.templates = opts.templates || {};

        if (!opts.name) {
            fail('Form name attribute needed.');
        }

        this.form = document.querySelector('form[name=' + opts.name + ']');
        if (!this.form) {
            fail('Form "' + opts.name + '" not found.');
        }

        this.state = {};
        this.cache = {};
        this.lifeCycle = {};

        this.listeners = [];
        this.validateOn = opts.on || 'submit';

        this.templates = {
            success: options.templates.success || '',
            error: options.templates.error || '',
        };
    }

    /**
     * Renders the 'message' under the input specified by 'name'.
     *
     * Will search for a DOM node with class '.status-message' to render
     * to (this might change soon). Will choose the template based
     * off of 'valid'.
     *
     * @param  {String} name    [description]
     * @param  {Boolean} valid   [description]
     * @param  {String} message [description]
     */
    Avowal.prototype._showStatus = function (name, valid, message) {
        var input = this.cache[name];
        var status = input.parentNode.querySelector('.status-message');

        input.classList.remove('success', 'error');
        input.classList.add(valid ? 'success' : 'error');

        status.innerHTML = render(valid ? this.templates.success : this.templates.error, {
            status: message,
        });
    };

    /**
     * Validates the input specified by name, will update the
     * validation state of the form (this.state) and also trigger
     * rendering of the status message.
     *
     * This function will call the side effect lifeCycle
     * methods 'whenValid' and 'whenInvalid'.
     *
     * @param  {String} name [description]
     */
    Avowal.prototype._validate = function (name) {
        var lifeCycle = this.lifeCycle[name];
        var input = this.cache[name];

        lifeCycle.validate(input.value, function (valid, message) {
            this.state[name] = valid;
            this._showStatus(name, valid, message);
            this._notifyChange();

            if (valid && lifeCycle.whenValid) {
                lifeCycle.whenValid(input.value);
            } else if (!valid && lifeCycle.whenInvalid) {
                lifeCycle.whenInvalid(input.value);
            }
        }.bind(this));
    };

    /**
     * Attaches appropriate events to inputs in the form.
     *
     * Calls the init lifeCycle method, binds 'on' to 'this._validate'
     *
     * @param  {String} name [description]
     * @param  {String} on   [description]
     */
    Avowal.prototype._initLifeCycle = function (name, on) {
        var lifeCycle = this.lifeCycle[name];
        var input = this.cache[name];

        if (lifeCycle.init) {
            lifeCycle.init(input);
        }

        if (lifeCycle.transform) {
            input.addEventListener('input', function () {
                input.value = lifeCycle.transform(input.value);
            });
        }

        input.addEventListener(on, function () {
            this._validate(name);
        }.bind(this));
    };

    /**
     * Delegates control of a form to the validator.
     *
     * The spec object's keys correspond to the name attributes
     * of the form's inputs. The values are the lifeCycle
     * objects for the matched inputs.
     *
     * @param  {Object} spec [description]
     */
    Avowal.prototype.delegate = function (spec) {
        forEvery(spec, function (name, lifeCycle) {
            var input = this.form.querySelector('[name=' + name + ']');

            if (!input) {
                fail('Input "' + name + '" not found in form "' + this.form.name + '".');
            }

            if (!lifeCycle.validate) {
                fail('Missing "validate" method on input "' + name + '".');
            }

            this.cache[name] = input;
            this.state[name] = false;
            this.lifeCycle[name] = lifeCycle;

            input.setAttribute('autocomplete', 'off');
            this._initLifeCycle(name, lifeCycle.on ? lifeCycle.on : this.validateOn);
        }.bind(this));
    };

    /**
     * Resets the validation state of the form.
     * If clear is 'truthy' the values in the form will also be cleared.
     *
     * @param  {Object} spec [{name: lifeCycle, ...}]
     */
    Avowal.prototype.reset = function (clear) {
        forEvery(this.state, function (name) {
            this.resetInput(name, clear);
        }.bind(this));
    };

    /**
     * Resets a given input's validation state based on the
     * name attribute of the input.
     *
     * If clear is 'truthy' the value of the input will also be reset.
     *
     * @param {String} name
     * @param {Boolean} clear
     */
    Avowal.prototype.resetInput = function (name, clear) {
        var input = this.cache[name];
        var lifeCycle = this.lifeCycle[name];
        var status = input.parentNode.querySelector('.status-message');

        if (clear) {
            input.value = '';
        }

        if (lifeCycle.init) {
            lifeCycle.init(this.cache[name]);
        }

        this.state[name] = false;
        input.classList.remove('success', 'error');
        status.innerHTML = '';
        this._notifyChange();
    };

    /**
     * Evaluates the current form state (does not execute the validate functions).
     *
     * @return {Boolean}
     */
    Avowal.prototype.isValid = function () {
        var allValid = true;

        forEvery(this.state, function (_, valid) {
            if (!valid) {
                allValid = false;
            }
        });
        return allValid;
    };

    /**
     * Evaluates all form inputs, waits for all 'N' inputs to finish
     * validating before executing the callback. (does execute the validate functions)
     *
     * Returns the status through the callback function.
     *
     * @param  {Function} callback [function (valid) {...}]
     */
    Avowal.prototype.validateAll = function (callback) {
        var allValid = true;
        var cb = callback || function () {};

        asyncForEvery(this.state, function (name, _, done) {
            var input = this.cache[name];
            var lifeCycle = this.lifeCycle[name];

            lifeCycle.validate(input.value, function (valid, message) {
                this.state[name] = valid;

                if (!valid) {
                    allValid = false;
                }

                this._showStatus(name, valid, message);
                done();
            }.bind(this));

        }.bind(this), function () {
            cb(allValid);
        });
    };

    /**
     * Executes all the listeners, passing them the current validation state.
     */
    Avowal.prototype._notifyChange = function () {
        this.listeners.forEach(function (listener) {
            listener(this.state);
        }.bind(this));
    };

    /**
     * Allows the seting of events on the form.
     *
     * The 'change' event is overridden to watch for changes of
     * the values in the form.
     *
     * @param  {String} target
     * @param  {Function} fun
     */
    Avowal.prototype.on = function (target, fun) {
        if (target === 'change') {
            this.listeners.push(fun);
        } else {
            this.form.addEventListener(target, fun);
        }
    };

    /**
     * Serializes the values in the form using the input cache.
     *
     * @return {Object} [object of {name => value}]
     */
    Avowal.prototype.values = function () {
        var vals = {};
        forEvery(this.cache, function (name, input) {
            vals[name] = input.value;
        });
        return vals;
    };

    /**
     * Will update the values in the form.
     *
     * As a side effect, the validate function will be executed against
     * any value changed.
     *
     * @param {Object} values [object of {name => value}]
     */
    Avowal.prototype.setValues = function (values) {
        forEvery(this.cache, function (name, input) {
            if (!values[name]) {
                return;
            }
            input.value = values[name];
            this._validate(name);
        }.bind(this));
    };

    // Node.js (CommonJS)
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Avowal;
    // included directly via <script> tag
    } else {
        root.Avowal = Avowal;
    }

}).call(this);

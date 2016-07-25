/**
 * Provides access to Markdown-related functions.
 * @module jsdoc/util/markdown
 * @author Michael Mathews <micmath@gmail.com>
 * @author Ben Blank <ben.blank@gmail.com>
 * @author Keith McKnight <keith@mcknig.ht>
 */
'use strict';

var env = require('jsdoc/env');
var util = require('util');

/**
 * Enumeration of Markdown parsers that are available.
 * @enum {String}
 */
var parserNames = {
    /**
     * The "[markdown-js](https://github.com/evilstreak/markdown-js)" (aka "evilstreak") parser.
     *
     * @deprecated Replaced by "marked," as markdown-js does not support inline HTML.
     */
    evilstreak: 'marked',
    /**
     * The "GitHub-flavored Markdown" parser.
     * @deprecated Replaced by "marked."
     */
    gfm: 'marked',
    /**
     * The "[Marked](https://github.com/chjj/marked)" parser.
     */
    marked: 'marked'
};

/**
 * Enumeration of code block highlighters that are available
 * @enum {String}
 */
var highlighterNames = {
    'hljs': 'highlight.js',
    'highlight.js': 'highlight.js',
    'highlightjs': 'highlight.js',
    'pygmentize-bundled': 'pygmentize',
    'pygmentize': 'pygmentize'
};

/**
 * Escape underscores that occur within {@ ... } in order to protect them
 * from the markdown parser(s).
 * @param {String} source the source text to sanitize.
 * @returns {String} `source` where underscores within {@ ... } have been
 * protected with a preceding backslash (i.e. \_) -- the markdown parsers
 * will strip the backslash and protect the underscore.
 */
function escapeUnderscores(source) {
    return source.replace(/\{@[^}\r\n]+\}/g, function (wholeMatch) {
        return wholeMatch.replace(/(^|[^\\])_/g, '$1\\_');
    });
}

/**
 * Escape HTTP/HTTPS URLs so that they are not automatically converted to HTML links.
 *
 * @param {string} source - The source text to escape.
 * @return {string} The source text with escape characters added to HTTP/HTTPS URLs.
 */
function escapeUrls(source) {
    return source.replace(/(https?)\:\/\//g, '$1:\\/\\/');
}

/**
 * Unescape HTTP/HTTPS URLs after Markdown parsing is complete.
 *
 * @param {string} source - The source text to unescape.
 * @return {string} The source text with escape characters removed from HTTP/HTTPS URLs.
 */
function unescapeUrls(source) {
    return source.replace(/(https?)\:\\\/\\\//g, '$1://');
}

/**
 * Escape characters in text within a code block.
 *
 * @param {string} source - The source text to escape.
 * @return {string} The escaped source text.
 */
function escapeCode(source) {
    return source.replace(/</g, '&lt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Unencode quotes that occur within {@ ... } after the markdown parser has turned them
 * into html entities (unfortunately it isn't possible to escape them before parsing)
 *
 * @param {string} source - The source text to unencode.
 * @return {string} The source text with html entity `&quot;` converted back to standard quotes
 */
function unencodeQuotes(source) {
    return source.replace(/\{@[^}\r\n]+\}/g, function (wholeMatch) {
        return wholeMatch.replace(/&quot;/g, '"');
    });
}


/**
 * Retrieve a function that accepts a single parameter containing Markdown source. The function uses
 * the specified parser to transform the Markdown source to HTML, then returns the HTML as a string.
 *
 * @private
 * @param {String} parserName The name of the selected parser.
 * @param {Object} [conf] Configuration for the selected parser, if any.
 * @returns {Function} A function that accepts Markdown source, feeds it to the selected parser, and
 * returns the resulting HTML.
 */
function getParseFunction(parserName, conf) {
    var logger = require('jsdoc/util/logger');
    var marked = require('marked');

    var markedRenderer, markedRendererCode, parserFunction;

    conf = conf || {};

    if (parserName === parserNames.marked) {
        if (conf.hardwrap) {
            marked.setOptions({breaks: true});
        }

        (function(highlight) {
            if (!highlight) {
                return;
            }

            // Default to highlight.js
            if (highlight === true) {
                highlight = highlighterNames.hljs;
            }

            highlight = highlighterNames[highlight];

            if (highlight === 'highlight.js') {
                highlight = function(code, lang) {
                    try {
                        var hljs = require('highlight.js');
                    } catch(e) {
                        logger.error('Could not find highlight.js');
                        return code;
                    }

                    if (lang) {
                        return hljs.highlight(lang, code).value;
                    } else {
                        return hljs.highlightAuto(code).value;
                    }
                };
            } else if (highlight === 'pygmentize') {
                highlight = function(code, lang, callback) {
                    try {
                        var pygmentize = require('pygmentize-bundled');
                    } catch(e) {
                        logger.error('Could not find pygmentize-bundled');
                        callback(null, code);
                    }

                    pygmentize({
                        lang: lang,
                        format: 'html'
                    }, code, function (err, result) {
                        callback(err, result.toString());
                    });
                };
            } else if (typeof highlight !== 'function') {
                logger.error('Unrecognized code block highlighter "%s". Highlighting disabled.',
            parserName);
            }

            marked.setOptions({highlight: highlight});
        })(conf.highlight);

        // Marked generates an "id" attribute for headers; this custom renderer suppresses it
        markedRenderer = new marked.Renderer();

        if (!conf.idInHeadings) {
            markedRenderer.heading = function(text, level) {
                return util.format('<h%s>%s</h%s>', level, text, level);
            };
        }

        // Monkey patch the code renderer to add classnames to the <pre> tag.
        markedRendererCode = markedRenderer.code;
        markedRenderer.code = function(code, lang, escaped) {
            var formattedCode = markedRendererCode.apply(this, arguments);

            // Add CSS classname to <pre> tag
            formattedCode = formattedCode.replace('<pre>', util.format('<pre class="%s">', 'source'));

            return formattedCode;
        };

        parserFunction = function(source) {
            var result;

            source = escapeUnderscores(source);
            source = escapeUrls(source);

            result = marked(source, { renderer: markedRenderer })
                .replace(/\s+$/, '')
                .replace(/&#39;/g, "'");

            result = unescapeUrls(result);
            result = unencodeQuotes(result);

            return result;
        };
        parserFunction._parser = parserNames.marked;
    } else {
        logger.error('Unrecognized Markdown parser "%s". Markdown support is disabled.',
            parserName);
    }

    return parserFunction;
}

/**
 * Retrieve a Markdown parsing function based on the value of the `conf.json` file's
 * `env.conf.markdown` property. The parsing function accepts a single parameter containing Markdown
 * source. The function uses the parser specified in `conf.json` to transform the Markdown source to
 * HTML, then returns the HTML as a string.
 *
 * @returns {function} A function that accepts Markdown source, feeds it to the selected parser, and
 * returns the resulting HTML.
 */
exports.getParser = function() {
    var conf = env.conf.markdown;
    // marked is the default parser
    var parser = (conf && conf.parser) || 'marked';
    return getParseFunction(parserNames[parser], conf);
};

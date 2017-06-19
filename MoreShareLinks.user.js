// ==UserScript==
// @name         More Share Links
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.04
// @description  Adds other formatting options to share links.
// @author       Jason C
// @include      /^https?:\/\/([^/]*\.)?stackoverflow.com/questions/\d.*$/
// @include      /^https?:\/\/([^/]*\.)?serverfault.com/questions/\d.*$/
// @include      /^https?:\/\/([^/]*\.)?superuser.com/questions/\d.*$/
// @include      /^https?:\/\/([^/]*\.)?stackexchange.com/questions/\d.*$/
// @include      /^https?:\/\/([^/]*\.)?askubuntu.com/questions/\d.*$/
// @include      /^https?:\/\/([^/]*\.)?stackapps.com/questions/\d.*$/
// @include      /^https?:\/\/([^/]*\.)?mathoverflow\.net/questions/\d.*$/
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const NAMESPACE_UID = '2fa83f05-b32c-45b8-99ca-53bbe79156cc';

    let data = { settings: {}, uid: NAMESPACE_UID };
    for (let key of GM_listValues())
        data.settings[key] = GM_getValue(key);

    window.addEventListener(`setvalue-${NAMESPACE_UID}`, function (ev) {
        GM_setValue(ev.detail.key, ev.detail.value);
    });

    window.addEventListener(`reset-${NAMESPACE_UID}`, function (ev) {
        for (let key of GM_listValues())
            GM_deleteValue(key);
    });

    (function (f, d) {
        let script = document.createElement('script');
        script.type = 'text/javascript';
        script.textContent = `(${f.toString()})(window.jQuery, ${JSON.stringify(d)})`;
        document.body.appendChild(script);
    })(MoreShareLinks, data);

function MoreShareLinks ($, data) {

    const DATA_ID        = 'moresharelinks-id';
    const DATA_SHORT_URL = 'moresharelinks-short-url';
    const DATA_LONG_URL  = 'moresharelinks-url';
    const OPT_LAST_ID    = 'lastSelectedId';
    const OPT_SHORTEN    = 'shortenUrl';
    const LABEL_BASIC    = 'Share a link to this question';
    const LABEL_MARKDOWN = 'Markdown';
    const LABEL_HTML     = 'HTML';
    const LABEL_BBCODE   = 'BBCode';
    const LABEL_USERID   = ' (includes your user id)';

    const questionTitle = $('#question-header > h1').text().trim();

    // DOMSubtreeModified is deprecated in favor of MutationObservers but I kind of
    // do not care at the moment, unless somebody reports breakage.
    $('.post-menu').bind('DOMSubtreeModified', function (event) {

        let tip = $(event.target).find('.share-tip');
        if (tip.length === 0)
            return;
        let input = tip.children('input[type="text"]');
        let url = input.val();
        let style = input.attr('style');
        let icons = tip.children('#share-icons');

        let url_short;
        if (/\/[0-9]+\/[0-9]+$/.test(url)) // Make sure user ID present (missing when not logged in)
            url_short = url.replace(/\/[0-9]+$/, '');
        else
            url_short = url;

        // Markdown: Escape brackets only. Not escaping slashes for now because
        // doing that ruins MathJax. Not sure what the right thing to do there is...
        let title_md = questionTitle.replace('[', '\\[').replace(']', '\\]');
        let share_md = `[${title_md}](${url})`;
        let share_md_short = `[${title_md}](${url_short})`;
        // Very minimal HTML escaping...
        let title_html = questionTitle.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
        let share_html = `<a href="${url}">${title_html}</a>`;
        let share_html_short = `<a href="${url_short}">${title_html}</a>`;
        // BBCode doesn't support escaping square brackets, unfortunately. I could
        // be more conservative about replacements but, whatever.
        let title_bb = questionTitle.replace('[', '(').replace(']', ')');
        let share_bb = `[url=${url}]${title_bb}[/url]`;
        let share_bb_short = `[url=${url_short}]${title_bb}[/url]`;

        // Use attr(data-*) instead of data() for msl id, because selectors are simpler later.
        var textBasic, textMarkdown, textHTML, textBBCode;
        textBasic = tip[0].childNodes[0];
        input
            .data(DATA_LONG_URL, url)
            .data(DATA_SHORT_URL, url_short)
            .attr(`data-${DATA_ID}`, 'basic');
        $(textMarkdown = document.createTextNode(''))
            .insertBefore(icons);
        $('<input type="text"/>')
            .data(DATA_LONG_URL, share_md)
            .data(DATA_SHORT_URL, share_md_short)
            .attr('style', style)
            .attr(`data-${DATA_ID}`, 'markdown')
            .insertBefore(icons);
        $(textHTML = document.createTextNode(''))
            .insertBefore(icons);
        $('<input type="text"/>')
            .data(DATA_LONG_URL, share_html)
            .data(DATA_SHORT_URL, share_html_short)
            .attr('style', style)
            .attr(`data-${DATA_ID}`, 'html')
            .insertBefore(icons);
        $(textBBCode = document.createTextNode(''))
            .insertBefore(icons);
        $('<input type="text"/>')
            .data(DATA_LONG_URL, share_bb)
            .data(DATA_SHORT_URL, share_bb_short)
            .attr('style', style)
            .attr(`data-${DATA_ID}`, 'bbcode')
            .insertBefore(icons);

        let checkbox;
        $('<label/>')
            .css('float', 'right')
            .append((checkbox = $('<input type="checkbox"/>')).prop('checked', load(OPT_SHORTEN, false)))
            .append(document.createTextNode('Remove user ID'))
            .appendTo(icons);

        checkbox.change(function () {
            let shorten = $(this).is(':checked');
            textBasic.data = makeLabel(LABEL_BASIC, shorten);
            textHTML.data = makeLabel(LABEL_HTML, shorten);
            textMarkdown.data = makeLabel(LABEL_MARKDOWN, shorten);
            textBBCode.data = makeLabel(LABEL_BBCODE, shorten);
            tip.children('input[type="text"]').each(function (_, i) {
                $(i).attr('value', $(i).data(shorten ? DATA_SHORT_URL : DATA_LONG_URL));
            });
            store(OPT_SHORTEN, shorten);
        });

        // Kludge to initialize label values and stuff.
        checkbox.trigger('change');

        // Bonus feature.
        tip.children('input[type="text"]').click(function () {
            store(OPT_LAST_ID, $(this).data(DATA_ID));
            this.select();
        });

        // Restore last clicked item so we can reselect.
        let lastSelected = load(OPT_LAST_ID, 'basic');

        // Hack to restore focus to the original share input, because I guess that
        // auto-select happens *after* this event is processed.
        setTimeout(function () {
            let initial = tip.children(`input[type="text"][data-${DATA_ID}="${lastSelected}"]`);
            if (initial.length === 0)
                initial = input;
            initial.click();
        }, 10);

    });

    function makeLabel (label, simplified) {
        return `${label}${simplified ? '' : LABEL_USERID}:`;
    }

    function store (key, value) {
        data.settings[key] = value;
        window.dispatchEvent(new CustomEvent(`setvalue-${data.uid}`, { detail: {
            key: key,
            value: value
        }}));
    }

    function load (key, def) {
        if (typeof data.settings[key] === 'undefined')
            return def;
        else
            return data.settings[key];
    }

    window.MoreShareLinks = {
        forgetEverything: function () {
            window.dispatchEvent(new CustomEvent(`reset-${data.uid}`));
        }
    };

}

})();
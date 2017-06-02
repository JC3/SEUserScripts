// ==UserScript==
// @name         More Share Links
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.01
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
// ==/UserScript==

(function() {
    'use strict';

    const dataKey = 'moresharelinks-id';
    const questionTitle = $('#question-header').text().trim();

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

        let title_md = questionTitle.replace('[', '\\[').replace(']', '\\]');
        let share_md = `[${title_md}](${url})`;
        // Very minimal HTML escaping...
        let title_html = questionTitle.replace('<', '&lt;').replace('>', '&gt;');
        let share_html = `<a href="${url}">${title_html}</a>`;
        // BBCode doesn't support escaping square brackets, unfortunately. I could
        // be more conservative about replacements but, whatever.
        let title_bb = questionTitle.replace('[', '(').replace(']', ')');
        let share_bb = `[url=${url}]${title_bb}[/url]`;

        // Use attrr(data-*) instead of data(), because selectors are simpler later.
        input
            .attr(`data-${dataKey}`, 'basic');
        $(document.createTextNode('Markdown (includes your user id):'))
            .insertBefore(icons);
        $('<input type="text"/>')
            .attr('value', share_md)
            .attr('style', style)
            .attr(`data-${dataKey}`, 'markdown')
            .insertBefore(icons);
        $(document.createTextNode('HTML (includes your user id):'))
            .insertBefore(icons);
        $('<input type="text"/>')
            .attr('value', share_html)
            .attr('style', style)
            .attr(`data-${dataKey}`, 'html')
            .insertBefore(icons);
        $(document.createTextNode('BBCode (includes your user id):'))
            .insertBefore(icons);
        $('<input type="text"/>')
            .attr('value', share_bb)
            .attr('style', style)
            .attr(`data-${dataKey}`, 'bbcode')
            .insertBefore(icons);

        // Bonus feature.
        tip.children('input[type="text"]').click(function () {
            try {
                GM_setValue(dataKey, $(this).data(dataKey));
            } catch (e) {
                console.error(e);
            }
            this.select();
        });

        // Restore last clicked item so we can reselect.
        let lastSelected = 'basic';
        try {
            lastSelected = GM_getValue(dataKey, lastSelected);
        } catch (e) {
            console.error(e);
        }

        // Hack to restore focus to the original share input, because I guess that
        // auto-select happens *after* this event is processed.
        setTimeout(function () {
            let initial = tip.children(`input[type="text"][data-${dataKey}="${lastSelected}"]`);
            if (initial.length === 0)
                initial = input;
            initial.click();
        }, 10);

    });

    unsafeWindow.moreShareLinksReset = function () {
        GM_deleteValue(dataKey);
    };

})();
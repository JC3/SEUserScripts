// ==UserScript==
// @name         API Filter Loader
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.0
// @description  Allows API filter strings to be loaded back into API selection dialog.
// @author       Jason C
// @match        *://api.stackexchange.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var filterText;

    $('<div/>')
        .addClass('filter-controls')
        .prependTo('div.filter-popup')
        .append($('<div/>').addClass('filter-controls-left'))
        .append($('<div/>').addClass('filter-controls-right')
            .text('Filter: ')
            .append(filterText = $('<input type="text"/>').attr({size:16}))
            .append($('<input type="button"/>').attr({value:'load'}).click(decodeFilter))
        );

    function decodeFilter () {

        var filterString = filterText.val().trim();
        if (filterString === '')
            return;

        filterText.val(''); // it's less confusing to user later if we just clear the text

        $.getJSON(`//api.stackexchange.com/2.2/filters/${encodeURIComponent(filterString)}`, function (r) {
            console.log(`API Filter Reverse: Quota Remaining: ${r.quota_remaining}`);
            selectFilterItems(r);
        }).fail(function (e) {
            if (e.responseJSON)
                alert(`An error occurred: ${JSON.stringify(e.responseJSON)}`);
            else
                alert(`An error occurred: ${e}`);
        });

    }

    function selectFilterItems (filter) {

        if (!filter.items || filter.items.length === 0) {
            alert('No filter items returned.');
            return;
        }

        if (filter.items[0].filter_type == 'invalid') {
            alert('Invalid filter string entered.');
            return;
        }

        $('.filter-content .field-container input[type="checkbox"]').each(function(_, checkbox) {
            var id = $(checkbox).attr('id');
            var field = id.replace('-', '.').replace(/^\.wrapper/, '');
            var sel = ($.inArray(field, filter.items[0].included_fields) !== -1);
            // we can't just set checkbox state directly, we have to trigger a click, otherwise the
            // little count fields in the filter dropdown won't update properly.
            if ($(checkbox).prop('checked') != sel)
                $(checkbox).trigger('click');
        });

        var isunsafe = (filter.items[0].filter_type == 'unsafe');
        var cbunsafe = $('input[type="checkbox"]#filter-unsafe');
        if (cbunsafe.prop('checked') != isunsafe)
            cbunsafe.trigger('click');

        $('input[type="button"].filter-save').trigger('click');

    }

})();
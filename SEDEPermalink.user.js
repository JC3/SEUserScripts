// ==UserScript==
// @name         SEDE Parameterized Query Permalink
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.0
// @description  Adds ability to get permalinks for parameterized queries.
// @author       Jason C
// @match        *://data.stackexchange.com/*/query/*
// @exclude      *://data.stackexchange.com/*/query/edit*
// @exclude      *://data.stackexchange.com/*/query/new*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    $('<button type="button"/>')
        .addClass('btn-normal')
        .text('Get Link')
        .click(function () {
            var link = [
                window.location.protocol,
                '//',
                window.location.host,
                window.location.pathname,
                '?',
                $('#runQueryForm').serialize(),
                window.location.hash
            ].join('');
            window.prompt('Permalink:', link);
        })
        .insertAfter('#cancel-query');

})();
# Takes, as input, archived_posts.csv (result of an SEDE query, see readme.md).
# Produces, as output, deleted_post_ids.txt, and a bunch of HTML in deleted_posts_archive\.

import cgi
import csv
import datetime
import errno
import os
import requests
import time

updateStatus = True # Change to True to recheck from API

posts = {}

# Load the archived data.
with open('archived_posts.csv') as f:
    reader = csv.DictReader(f)
    for post in reader:
        if int(post['PostTypeId']) <= 2:
            post['Comments'] = []
            posts[int(post['Id'])] = post

with open('archived_comments.csv') as f:
    reader = csv.DictReader(f)
    for comment in reader:
        posts[int(comment['PostId'])]['Comments'].append(comment)

for _, post in posts.items():
    post['Comments'].sort(key=lambda x:x['Id'])

# Possibly update deleted status from the API, otherwise load it from the file.
if updateStatus:

    for k, post in posts.items():
        post['StillExists'] = False

    for k in range(0, len(posts), 100):
        ids = ';'.join(str(k) for k in posts.keys()[k:k+100])
        url = 'https://api.stackexchange.com/2.2/posts/%s?pagesize=100&order=desc&sort=activity&site=anime&filter=)Fz*hXf1(6N' % ids
        print '%s...' % url
        r = requests.get(url).json()
        for item in r['items']:
            posts[int(item['post_id'])]['StillExists'] = True
        print 'Quota remaining:', r['quota_remaining']
        time.sleep(3)

    with open('deleted_post_ids.txt', 'w') as f:
        f.write('# {}\n'.format(datetime.datetime.now().isoformat()))
        for k, post in posts.items():
            if not post['StillExists']:
                f.write('{}\n'.format(k))

    print 'Wrote deleted_post_ids.txt!'

else:

    print 'Loading deleted_post_ids.txt...'

    for k, post in posts.items():
        post['StillExists'] = True

    with open('deleted_post_ids.txt') as f:
        for line in f.readlines():
            if line.startswith('#'):
                print line.strip()
            else:
                posts[int(line.strip())]['StillExists'] = False

try:
    os.makedirs('deleted_post_archive')
except OSError as exception:
    if exception.errno != errno.EEXIST:
        raise # Just let it throw out of the program

def generatePostRow (f, post, parent):
    score = int(post['Score'])
    body = post['Body']
    user = cgi.escape(post['UserDisplayName'])
    when = cgi.escape(post['CreationDate'])
    if int(post['PostTypeId']) == 1:
        cls = 'question'
    else:
        cls = 'answer'
    try:
        if parent and int(post['Id']) == int(parent['AcceptedAnswerId']):
            cls = cls + ' accepted'
    except:
        pass
    if not post['StillExists']:
        cls = cls + ' deleted'
    try:
        userlink = '<a href="https://anime.stackexchange.com/users/{}">{}</a>'.format(int(post['OwnerUserId']), user)
    except:
        userlink = user
    if len(post['Comments']) > 0:
        rows = 3
    else:
        rows = 2
    whenlink = '<a href="https://anime.stackexchange.com/q/{}">{}</a>'.format(int(post['Id']), when)
    f.write('<tr class="{}"><td class="score-cell" rowspan="{}">{}\n'.format(cls, rows, score))
    f.write('<td class="post-cell"><a name="{}"></a>{}\n'.format(int(post['Id']), body))
    f.write('<tr class="{}"><td class="author-cell"><div class="author-card">{}<br>{}</div>\n'.format(cls, userlink, whenlink))
    if len(post['Comments']) > 0:
        f.write('<tr class="{}"><td class="comment-cell">\n'.format(cls));
        for comment in post['Comments']:
            c = cgi.escape(comment['Text'])
            i = '&mdash; {} on {}'.format(cgi.escape(comment['ActualDisplayName']), cgi.escape(comment['CreationDate']))
            f.write('<div><span class="comment-text">{}</span> <span class="comment-info">{}</span></div>\n'.format(c, i))
        
    
def generatePostHTML (post):

    with open('deleted_post_archive/{}.html'.format(int(post['Id'])), 'w') as f:

        title = cgi.escape(post['Title'])
        f.write('<html><head><title>{}</title><link rel="stylesheet" href="style.css"></head><body><div id="content">\n'.format(title))
        f.write('<center><a href="index.html">Index</a></center>\n')
        f.write('<h1><a href="https://anime.stackexchange.com/q/{}">{}</a></h1><table>\n'.format(int(post['Id']), title))

        generatePostRow(f, post, None)

        answers = {}
        for k, answer in posts.items():
            if int(answer['PostTypeId']) == 2 and int(answer['ParentId']) == int(post['Id']):
                answers[k] = answer
        
        for _, answer in sorted(answers.items(), key=lambda x: -int(x[1]['Score'])):
            generatePostRow(f, answer, post)
        
        f.write('</table><center><a href="index.html">Index</a></center></div></body></html>\n')
    
    pass

with open('deleted_post_archive/index.html', 'w') as idx:

    idx.write('<html><head><link rel="stylesheet" href="style.css"><title>DMCA Deleted Posts</title></head><body>\n')
    idx.write('<div id="content"><h1>Deleted Post Archive</h1><table class="index-table">\n')    
    deleted = 0
    
    for k, post in sorted(posts.items(), key=lambda x:x[1]['UserDisplayName']):
        if int(post['PostTypeId']) == 1:
            generatePostHTML(post)
            if not post['StillExists']:
                idx.write('<tr><td>{}<td>Question<td><a href="{}.html">{}</a>\n'.format(
                    cgi.escape(post['UserDisplayName']),
                    post['Id'],
                    cgi.escape(post['Title'])
                    ))
                deleted = deleted + 1

    for k, post in sorted(posts.items(), key=lambda x:x[1]['UserDisplayName']):
        if int(post['PostTypeId']) == 2 and not post['StillExists'] and posts[int(post['ParentId'])]['StillExists']:
            idx.write('<tr><td>{}<td>Answer<td><a href="{}.html#{}">{}</a>\n'.format(
                cgi.escape(post['UserDisplayName']),
                post['ParentId'],
                post['Id'],
                cgi.escape(posts[int(post['ParentId'])]['Title'])
                ))
            deleted = deleted + 1

    idx.write('</table><center class="note">Note: May include items deleted for other reasons.</center></div></body></html>\n')

    print 'Total: {}, Deleted: {}'.format(len(posts), deleted)

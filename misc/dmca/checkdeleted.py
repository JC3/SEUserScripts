# Takes, as input, archived_posts.csv (result of an SEDE query, see readme.md).
# Produces, as output, deleted_post_ids.txt.

import csv
import requests
import time
import datetime

posts = {}

with open('archived_posts.csv') as f:
    reader = csv.DictReader(f)
    for post in reader:
        if int(post['PostTypeId']) <= 2:
            post['StillExists'] = False
            posts[int(post['Id'])] = post

for k in range(0, len(posts), 100):
    ids = ';'.join(str(k) for k in posts.keys()[k:k+100])
    url = 'https://api.stackexchange.com/2.2/posts/%s?pagesize=100&order=desc&sort=activity&site=anime&filter=)Fz*hXf1(6N' % ids
    print '%s...' % url
    r = requests.get(url).json()
    for item in r['items']:
        posts[int(item['post_id'])]['StillExists'] = True
    print 'Quota remaining:', r['quota_remaining']
    time.sleep(3)

deleted = 0;
with open('deleted_post_ids.txt', 'w') as f:
    f.write('# {}\n'.format(datetime.datetime.now().isoformat()))
    for k, post in posts.items():
        if not post['StillExists']:
            deleted = deleted + 1
            f.write('{}\n'.format(k))

print 'Wrote deleted_post_ids.txt!'
print 'Total: {}, Deleted: {}'.format(len(posts), deleted)

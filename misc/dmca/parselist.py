import re

print 'create table #questions (id int)'
print 'create table #tags (name nvarchar(max))'

with open ('linklist.txt') as f:
    pat = re.compile('\/questions\/(([0-9]+)|tagged\/([^\/?]+))')
    for link in f.readlines():
        if not link.startswith('#'):
            res = pat.search(link.strip())
            if res:
                if res.group(2):
                    print 'insert into #questions values (%s)' % res.group(2)
                elif res.group(3):
                    print "insert into #tags values ('%s')" % res.group(3)


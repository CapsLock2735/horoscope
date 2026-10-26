"""Compare the API with Swiss Ephemeris on random charts (pip install pyswisseph).
Run from the repo root: SE_EPHE_PATH=/path/to/ephe python3 test/compare_swisseph.py [N] [first_year] [last_year]
SE_EPHE_PATH must hold sepl_18.se1 and semo_18.se1 (github.com/aloistr/swisseph, ephe/).
Without it Swiss Ephemeris silently falls back to its Moshier mode; the script then says so.
The numbers in README's Accuracy table come from this script with N=3000 (seed 7).
"""
import json, os, random, subprocess, sys, tempfile
import swisseph as swe
if os.environ.get('SE_EPHE_PATH'): swe.set_ephe_path(os.environ['SE_EPHE_PATH'])
random.seed(7)
N=int(sys.argv[1]) if len(sys.argv)>1 else 3000
cases=[]
y0=int(sys.argv[2]) if len(sys.argv)>2 else 1920; y1=int(sys.argv[3]) if len(sys.argv)>3 else 2040
lo=swe.julday(y0,1,1,0); hi=swe.julday(y1,12,31,0)
for i in range(N):
    jd=random.uniform(lo,hi); lat=random.uniform(-55,62); lon=random.uniform(-180,180)
    cases.append({'jd':jd,'ms':(jd-2440587.5)*86400000,'lat':lat,'lon':lon})
tmp=os.path.join(tempfile.mkdtemp(),'cases.json')
json.dump(cases,open(tmp,'w'))
api=json.loads(subprocess.check_output(['node',os.path.join(os.path.dirname(__file__),'eval_cases.mjs'),tmp]))
B={'Sun':swe.SUN,'Moon':swe.MOON,'Mercury':swe.MERCURY,'Venus':swe.VENUS,'Mars':swe.MARS,'Jupiter':swe.JUPITER,'Saturn':swe.SATURN,'Uranus':swe.URANUS,'Neptune':swe.NEPTUNE,'Pluto':swe.PLUTO,'NorthNode':swe.TRUE_NODE}
d=lambda a,b: abs(((a-b+540)%360)-180)
errs={k:[] for k in list(B)+['Ascendant','MC','cusp']}
sign_flip={k:0 for k in errs}; house_flip=0; worst={}
flag_used=None
for c,a in zip(cases,api):
    if 'error' in a: print('ERR',a); continue
    ref={}
    for k,v in B.items():
        xx,fl=swe.calc_ut(c['jd'],v,swe.FLG_SWIEPH); ref[k]=xx[0]; flag_used=fl
        if os.environ.get('SE_EPHE_PATH') and not fl & swe.FLG_SWIEPH: sys.exit(f'{k}: data files not used, check SE_EPHE_PATH')
    cus,ascmc=swe.houses(c['jd'],c['lat'],c['lon'],b'P')
    ref['Ascendant'],ref['MC']=ascmc[0],ascmc[1]
    for k in list(B)+['Ascendant','MC']:
        e=d(a[k],ref[k]); errs[k].append(e)
        if int(a[k]//30)!=int(ref[k]//30): sign_flip[k]+=1
        if e>worst.get(k,(0,))[0]: worst[k]=(e,c['jd'])
    if a['cusps']:
        for i in range(12):
            e=d(a['cusps'][i],cus[i]); errs['cusp'].append(e)
        # planet house placement
        def house(lonv,cs):
            for i in range(12):
                s,e2=cs[i],cs[(i+1)%12]
                if (lonv-s)%360 < (e2-s)%360: return i
        for k in B:
            if house(ref[k],list(cus))!=house(a[k],a['cusps']): house_flip+=1
print('reference:', 'Swiss Ephemeris data files' if flag_used & swe.FLG_SWIEPH else 'Moshier fallback (no .se1 files found)')
print(f'{"body":10} {"max°":>8} {"p99°":>8} {"mean°":>8}   maxArcsec signflips')
for k,v in errs.items():
    if not v: continue
    s=sorted(v); print(f'{k:10} {s[-1]:8.4f} {s[int(len(s)*.99)]:8.4f} {sum(s)/len(s):8.4f} {s[-1]*3600:7.0f} {sign_flip.get(k,0)}')
print('house placement mismatches:',house_flip,'of',N*11)
print('worst', {k:(round(v[0],4), swe.revjul(v[1])[:3]) for k,v in worst.items()})

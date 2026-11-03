"""Import operator-reviewed FAL contracts without fetching runner-advertised URLs."""
import argparse
import hashlib
import json
from pathlib import Path


def resolve(value, document, seen=()):
    if isinstance(value, list):
        return [resolve(item, document, seen) for item in value]
    if not isinstance(value, dict):
        return value
    if '$ref' in value:
        ref=value['$ref']
        if not ref.startswith('#/components/schemas/') or ref in seen:
            raise ValueError('Only nonrecursive local FAL schema references are accepted')
        target=document
        for part in ref[2:].split('/'):
            target=target[part.replace('~1','/').replace('~0','~')]
        merged=resolve(target,document,(*seen,ref))
        return {**merged,**{k:resolve(v,document,seen) for k,v in value.items() if k!='$ref'}}
    return {key:resolve(item,document,seen) for key,item in value.items()}


def defaults(schema):
    if 'const' in schema:
        return schema['const']
    if 'default' in schema:
        return schema['default']
    result={}
    for key,child in schema.get('properties',{}).items():
        value=defaults(child)
        if value is not MISSING:
            result[key]=value
    return result if result else MISSING


MISSING=object()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    index=json.loads((args.catalog/'index.json').read_text())
    result=[]
    for entry in index['routes']:
        root=args.catalog/'contracts'/entry['capability']
        raw=(root/'schema.json').read_bytes()
        route=json.loads((root/'route.json').read_text())
        digest=hashlib.sha256(raw).hexdigest()
        assert digest==route['schema']['sha256']
        document=json.loads(raw)
        assert document['endpoint_id']==entry['endpoint_id']
        schema=resolve(document['input_schema'],document)
        assert schema.get('type')=='object'
        initial=defaults(schema)
        result.append({'app':entry['app_id'].removeprefix('comfystream/'),
            'endpoint_id':entry['endpoint_id'],'contract_hash':digest,
            'schema_digest':'sha256:'+hashlib.sha256(json.dumps(schema,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
            'input_schema':schema,'defaults':{} if initial is MISSING else initial})
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,indent=2)+'\n')
    print(f'Imported {len(result)} reviewed FAL request contracts')


if __name__=='__main__':
    main()

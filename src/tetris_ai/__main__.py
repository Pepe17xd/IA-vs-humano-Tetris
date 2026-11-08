import argparse,json
from pathlib import Path
from .core import play
from .human_lab import sample_latencies,summary

def main():
    p=argparse.ArgumentParser(description='Tetris AI offline research CLI')
    sub=p.add_subparsers(dest='cmd',required=True)
    b=sub.add_parser('benchmark'); b.add_argument('--seed',type=int,default=42);b.add_argument('--turns',type=int,default=100);b.add_argument('--depth',type=int,default=2);b.add_argument('--width',type=int,default=16);b.add_argument('--langgraph',action='store_true');b.add_argument('--output')
    v=sub.add_parser('vision');v.add_argument('--region',default='config/board_region.json');v.add_argument('--empty-value',type=int,default=40);v.add_argument('--occupied-value',type=int,default=90);v.add_argument('--saturation',type=int,default=80);v.add_argument('--fraction',type=float,default=0.70);v.add_argument('--export-dir',default='results/vision')
    t=sub.add_parser('temporal');t.add_argument('--region',default='config/board_region.json');t.add_argument('--history',type=int,default=5);t.add_argument('--sequence',type=int,default=30);t.add_argument('--export-dir',default='results/sequence')
    a=sub.add_parser('assist');a.add_argument('--region',default='config/board_region.json');a.add_argument('--history',type=int,default=5);a.add_argument('--export-dir',default='results/assist');a.add_argument('--delay',type=int,default=5);a.add_argument('--debug',action='store_true');a.add_argument('--debug-position',type=int,nargs=2,metavar=('X','Y'));a.add_argument('--export-every',type=int,default=30);a.add_argument('--max-frames',type=int)
    e=sub.add_parser('evaluate');e.add_argument('labels')
    c=sub.add_parser('calibrate');c.add_argument('--region',default='config/board_region.json');c.add_argument('--delay',type=int,default=5,help='seconds before capture (default: 5)')
    h=sub.add_parser('human-lab');h.add_argument('--n',type=int,default=1000)
    sub.add_parser('channel-stats')
    args=p.parse_args()
    if args.cmd=='benchmark':
        if args.turns<1 or not 1<=args.depth<=4 or not 1<=args.width<=256: p.error('invalid benchmark parameters')
        if args.langgraph:
            from .graph import build_graph
            result=build_graph().invoke({'seed':args.seed,'turns':args.turns,'depth':args.depth,'width':args.width})['result']
        else: result=play(args.seed,args.turns,args.depth,args.width)
        if args.output:
            Path(args.output).parent.mkdir(parents=True,exist_ok=True)
            Path(args.output).write_text(json.dumps(result,indent=2),encoding='utf-8')
        print(json.dumps({k:v for k,v in result.items() if k not in ('board','moves')},indent=2))
    elif args.cmd=='vision':
        from .vision import preview, Thresholds
        try:
            preview(args.region, Thresholds(args.empty_value, args.occupied_value, args.saturation, args.fraction), args.export_dir)
        except (ValueError, OSError) as exc:
            p.exit(2, f'Vision error: {exc}\n')
    elif args.cmd=='temporal':
        from .temporal_ui import run
        try:
            run(args.region,args.history,args.sequence,args.export_dir)
        except (ValueError, OSError) as exc:
            p.exit(2, f'Temporal error: {exc}\n')
    elif args.cmd=='assist':
        from .live_assistant import run
        try:
            run(args.region, args.history, args.export_dir, args.delay, args.debug, args.debug_position, args.export_every, args.max_frames)
        except (ValueError, OSError) as exc:
            p.exit(2, f'Assistant error: {exc}\n')
    elif args.cmd=='evaluate':
        from .evaluation import evaluate
        try:
            print(json.dumps(evaluate(args.labels), indent=2))
        except (ValueError, OSError, KeyError, TypeError) as exc:
            p.exit(2, f'Evaluation error: {exc}\n')
    elif args.cmd=='calibrate':
        from .vision import calibrate
        try:
            calibrate(args.region, args.delay)
        except (ValueError, OSError) as exc:
            p.exit(2, f'Calibration error: {exc}\n')
    elif args.cmd=='human-lab': print(json.dumps(summary(sample_latencies(args.n)),indent=2))
    elif args.cmd=='channel-stats':
        from .channel import fetch_public_stats
        print(json.dumps(fetch_public_stats(),indent=2))
if __name__=='__main__': main()

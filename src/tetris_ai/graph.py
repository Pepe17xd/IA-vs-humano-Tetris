"""LangGraph orchestration for offline benchmark analysis."""
from typing import TypedDict

class State(TypedDict):
    seed:int
    turns:int
    depth:int
    width:int
    result:dict

def build_graph():
    from langgraph.graph import StateGraph, START, END
    from .core import play
    def run(state:State):
        return {'result':play(state['seed'],state['turns'],state['depth'],state['width'])}
    graph=StateGraph(State)
    graph.add_node('benchmark',run)
    graph.add_edge(START,'benchmark')
    graph.add_edge('benchmark',END)
    return graph.compile()

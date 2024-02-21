use crate::systems::def_graph_utils::{unique_spec_identifier, unique_stream_identifier};
use petgraph::graph::DiGraph;
use petgraph::graph::NodeIndex;
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq)]
pub enum NodeType {
    RootSpec,
    Spec,
    StreamDef,
    Inlet,
    Outlet,
    Alias,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DefGraphNode {
    pub node_type: NodeType,
    pub spec_name: Option<String>,
    pub unique_spec_label: Option<String>,
    pub tag: Option<String>,
    pub has_transform: Option<bool>,
    pub stream_def_id: Option<String>,
    pub alias: Option<String>,
    pub direction: Option<String>,
    pub label: String,
}

pub struct DefGraph {
    pub graph: DiGraph<DefGraphNode, ()>,
    pub node_indices: HashMap<String, NodeIndex>,
}

impl DefGraph {
    pub fn assign_alias(
        &mut self,
        alias: &str,
        spec_name: &str,
        root_spec_name: &str,
        direction: &str,
        tag: &str,
    ) {
        let root_spec_id = unique_spec_identifier(root_spec_name, None);
        let root_spec_node_id = self
            .find_node(|node| {
                node.node_type == NodeType::RootSpec && node.spec_name.as_deref() == Some(root_spec_name)
            })
            .expect("Root spec node not found");

        let spec_id = unique_spec_identifier(spec_name, None);
        let spec_node_id = self
            .find_node(|node| {
                node.node_type == NodeType::Spec && node.spec_name.as_deref() == Some(spec_name)
            })
            .expect("Spec node not found");

        let alias_node_id = self.ensure_node(
            &format!("{}_{}", root_spec_id, alias),
            DefGraphNode {
                node_type: NodeType::Alias,
                spec_name: None,
                unique_spec_label: None,
                tag: None,
                has_transform: None,
                stream_def_id: None,
                alias: Some(alias.to_string()),
                direction: Some(direction.to_string()),
                label: format!("{}_{}", root_spec_id, alias),
            },
        );

        match direction {
            "in" => {
                let inlet_node_id = self
                    .find_node(|node| {
                        node.node_type == NodeType::Inlet
                            && node.spec_name.as_deref() == Some(spec_name)
                            && node.tag.as_deref() == Some(tag)
                    })
                    .expect("Inlet node not found");
                self.graph.add_edge(inlet_node_id, alias_node_id, ());
                self.graph.add_edge(alias_node_id, root_spec_node_id, ());
            }
            "out" => {
                let outlet_node_id = self
                    .find_node(|node| {
                        node.node_type == NodeType::Outlet
                            && node.spec_name.as_deref() == Some(spec_name)
                            && node.tag.as_deref() == Some(tag)
                    })
                    .expect("Outlet node not found");
                self.graph.add_edge(root_spec_node_id, alias_node_id, ());
                self.graph.add_edge(alias_node_id, outlet_node_id, ());
            }
            _ => panic!("Invalid direction for alias assignment"),
        }
    }

    pub fn get_inbound_node_sets(&self, spec_node_id: NodeIndex) -> Vec<(NodeIndex, NodeIndex)> {
        self.graph
            .neighbors_directed(spec_node_id, petgraph::Incoming)
            .filter_map(|inlet_node_id| {
                if let Some(inlet_node) = self.graph.node_weight(inlet_node_id) {
                    if inlet_node.node_type == NodeType::Inlet {
                        let stream_node_id = self
                            .graph
                            .neighbors_directed(inlet_node_id, petgraph::Incoming)
                            .next() // Assuming there is only one stream node connected to the inlet
                            .expect("Inlet node should have an incoming stream node");
                        Some((inlet_node_id, stream_node_id))
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect()
    }

    pub fn get_outbound_node_sets(&self, spec_node_id: NodeIndex) -> Vec<(NodeIndex, NodeIndex)> {
        self.graph
            .neighbors_directed(spec_node_id, petgraph::Outgoing)
            .filter_map(|outlet_node_id| {
                if let Some(outlet_node) = self.graph.node_weight(outlet_node_id) {
                    if outlet_node.node_type == NodeType::Outlet {
                        let stream_node_id = self
                            .graph
                            .neighbors_directed(outlet_node_id, petgraph::Outgoing)
                            .next() // Assuming there is only one stream node connected to the outlet
                            .expect("Outlet node should have an outgoing stream node");
                        Some((outlet_node_id, stream_node_id))
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect()
    }

    pub fn filter_inbound_neighbors<F>(&self, node_id: &str, mut condition: F) -> Vec<NodeIndex>
    where
        F: FnMut(&DefGraphNode) -> bool,
    {
        if let Some(&index) = self.node_indices.get(node_id) {
            self.graph
                .neighbors_directed(index, petgraph::Incoming)
                .filter_map(|neighbor_index| {
                    self.graph.node_weight(neighbor_index).and_then(|node| {
                        if condition(node) {
                            Some(neighbor_index)
                        } else {
                            None
                        }
                    })
                })
                .collect()
        } else {
            vec![]
        }
    }
    pub fn ensure_edge(&mut self, from_id: &str, to_id: &str) {
        let from_index = self.node_indices.get(from_id);
        let to_index = self.node_indices.get(to_id);

        if let (Some(&from_index), Some(&to_index)) = (from_index, to_index) {
            if !self.graph.contains_edge(from_index, to_index) {
                self.graph.add_edge(from_index, to_index, ());
            }
        } else {
            panic!(
                "One or both nodes not found for IDs: {} -> {}",
                from_id, to_id
            );
        }
    }
    pub fn find_node<F>(&self, mut condition: F) -> Option<NodeIndex>
    where
        F: FnMut(&DefGraphNode) -> bool,
    {
        self.graph.node_indices().find(|&index| {
            if let Some(node) = self.graph.node_weight(index) {
                condition(node)
            } else {
                false
            }
        })
    }

    pub fn ensure_inlet_and_stream(
        &mut self,
        spec_name: &str,
        tag: &str,
        has_transform: bool,
    ) -> (NodeIndex, NodeIndex) {
        let spec_id = unique_spec_identifier(spec_name, None);
        let spec_node_id = self.ensure_node(
            &spec_id,
            DefGraphNode {
                node_type: NodeType::Spec,
                spec_name: Some(spec_id.clone()),
                unique_spec_label: None,
                tag: None,
                has_transform: None,
                stream_def_id: None,
                alias: None,
                direction: None,
                label: spec_id.clone(),
            },
        );

        let inlet_node_id = self.ensure_node(
            &format!("{}_{}", spec_id, tag),
            DefGraphNode {
                node_type: NodeType::Inlet,
                spec_name: None,
                unique_spec_label: None,
                tag: Some(tag.to_string()),
                has_transform: Some(has_transform),
                stream_def_id: None,
                alias: None,
                direction: None,
                label: format!("{}_{}", spec_id, tag),
            },
        );

        let stream_def_id = format!("{}_{}_stream", spec_name, tag);
        let stream_node_id = self.ensure_node(
            &format!("{}_{}_stream", spec_id, tag),
            DefGraphNode {
                node_type: NodeType::StreamDef,
                spec_name: None,
                unique_spec_label: None,
                tag: None,
                has_transform: None,
                stream_def_id: Some(stream_def_id.clone()),
                alias: None,
                direction: None,
                label: format!("{}_{}_stream", spec_id, tag),
            },
        );

        self.graph.add_edge(stream_node_id, inlet_node_id, ());
        self.graph.add_edge(inlet_node_id, spec_node_id, ());

        (inlet_node_id, stream_node_id)
    }

    pub fn ensure_outlet_and_stream(
        &mut self,
        spec_name: &str,
        tag: &str,
    ) -> (NodeIndex, NodeIndex) {
        let spec_id = unique_spec_identifier(spec_name, None);
        let spec_node_id = self.ensure_node(
            &spec_id,
            DefGraphNode {
                node_type: NodeType::Spec,
                spec_name: Some(spec_id.clone()),
                unique_spec_label: None,
                tag: None,
                has_transform: None,
                stream_def_id: None,
                alias: None,
                direction: None,
                label: spec_id.clone(),
            },
        );

        let outlet_node_id = self.ensure_node(
            &format!("{}_{}", spec_id, tag),
            DefGraphNode {
                node_type: NodeType::Outlet,
                spec_name: None,
                unique_spec_label: None,
                tag: Some(tag.to_string()),
                has_transform: None,
                stream_def_id: None,
                alias: None,
                direction: None,
                label: format!("{}_{}", spec_id, tag),
            },
        );

        let stream_def_id = format!("{}_{}_stream", spec_name, tag);
        let stream_node_id = self.ensure_node(
            &format!("{}_{}_stream", spec_id, tag),
            DefGraphNode {
                node_type: NodeType::StreamDef,
                spec_name: None,
                unique_spec_label: None,
                tag: None,
                has_transform: None,
                stream_def_id: Some(stream_def_id.clone()),
                alias: None,
                direction: None,
                label: format!("{}_{}_stream", spec_id, tag),
            },
        );

        self.graph.add_edge(spec_node_id, outlet_node_id, ());
        self.graph.add_edge(outlet_node_id, stream_node_id, ());

        (outlet_node_id, stream_node_id)
    }

    // ... (other methods) ...
    pub fn new() -> Self {
        DefGraph {
            graph: DiGraph::<DefGraphNode, ()>::new(),
            node_indices: HashMap::new(),
        }
    }

    pub fn get_spec_node_ids(&self) -> Vec<NodeIndex> {
        self.graph
            .node_indices()
            .filter(|&index| {
                if let Some(node) = self.graph.node_weight(index) {
                    node.node_type == NodeType::Spec
                } else {
                    false
                }
            })
            .collect()
    }

    pub fn ensure_node(&mut self, id: &str, data: DefGraphNode) -> NodeIndex {
        match self.node_indices.get(id) {
            Some(&index) => index,
            None => {
                let index = self.graph.add_node(data);
                self.node_indices.insert(id.to_string(), index);
                index
            }
        }
    }

    pub fn filter_outbound_neighbors<F>(&self, node_id: &str, mut condition: F) -> Vec<NodeIndex>
    where
        F: FnMut(&DefGraphNode) -> bool,
    {
        if let Some(&index) = self.node_indices.get(node_id) {
            self.graph
                .neighbors_directed(index, petgraph::Outgoing)
                .filter_map(|neighbor_index| {
                    self.graph.node_weight(neighbor_index).and_then(|node| {
                        if condition(node) {
                            Some(neighbor_index)
                        } else {
                            None
                        }
                    })
                })
                .collect()
        } else {
            vec![]
        }
    }
}

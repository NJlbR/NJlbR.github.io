import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AnnotationPopup } from '../components/AnnotationPopup';

interface GraphNode {
  id: string;
  term: string;
  connections: number;
}

interface GraphEdge {
  from: string;
  to: string;
  postId: string;
}

export function AnnotationsGraph() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGraphData();
  }, []);

  async function fetchGraphData() {
    const { data: postAnnotations, error } = await supabase
      .from('post_annotations')
      .select(`
        post_id,
        annotation_id,
        annotations (
          id,
          term
        )
      `);

    if (error || !postAnnotations) {
      setLoading(false);
      return;
    }

    const annotationsByPost = new Map<string, Set<string>>();
    const annotationTerms = new Map<string, string>();

    postAnnotations.forEach((pa: any) => {
      if (!annotationsByPost.has(pa.post_id)) {
        annotationsByPost.set(pa.post_id, new Set());
      }
      annotationsByPost.get(pa.post_id)!.add(pa.annotation_id);
      annotationTerms.set(pa.annotation_id, pa.annotations.term);
    });

    const connectionCounts = new Map<string, number>();
    const edgesSet = new Set<string>();
    const edgesList: GraphEdge[] = [];

    annotationsByPost.forEach((annotations, postId) => {
      const annotationArray = Array.from(annotations);

      for (let i = 0; i < annotationArray.length; i++) {
        const annId1 = annotationArray[i];
        connectionCounts.set(annId1, (connectionCounts.get(annId1) || 0) + 1);

        for (let j = i + 1; j < annotationArray.length; j++) {
          const annId2 = annotationArray[j];
          const edgeKey = [annId1, annId2].sort().join('-');

          if (!edgesSet.has(edgeKey)) {
            edgesSet.add(edgeKey);
            edgesList.push({
              from: annId1,
              to: annId2,
              postId,
            });
          }
        }
      }
    });

    const nodesList: GraphNode[] = Array.from(annotationTerms.entries()).map(([id, term]) => ({
      id,
      term,
      connections: connectionCounts.get(id) || 0,
    }));

    setNodes(nodesList);
    setEdges(edgesList);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-6"></div>
          <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          Граф связей аннотаций
        </h1>

        {nodes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              Аннотаций пока нет. Добавьте посты с аннотациями!
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <strong>Всего аннотаций:</strong> {nodes.length} | <strong>Связей:</strong> {edges.length}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Аннотации соединены, если встречались в одном посте. Размер узла зависит от количества связей.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {nodes
                .sort((a, b) => b.connections - a.connections)
                .map((node) => {
                  const connectedNodes = new Set<string>();
                  edges.forEach(edge => {
                    if (edge.from === node.id) connectedNodes.add(edge.to);
                    if (edge.to === node.id) connectedNodes.add(edge.from);
                  });

                  return (
                    <button
                      key={node.id}
                      onClick={() => setSelectedAnnotationId(node.id)}
                      className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 hover:from-blue-100 hover:to-blue-200 dark:hover:from-blue-800/40 dark:hover:to-blue-700/40 rounded-lg transition-all transform hover:scale-105 text-left"
                    >
                      <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                        {node.term}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className="bg-blue-600 text-white px-2 py-1 rounded-full text-xs">
                          {node.connections} постов
                        </span>
                        {connectedNodes.size > 0 && (
                          <span className="bg-purple-600 text-white px-2 py-1 rounded-full text-xs">
                            {connectedNodes.size} связей
                          </span>
                        )}
                      </div>
                      {connectedNodes.size > 0 && (
                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          Связана с: {Array.from(connectedNodes)
                            .slice(0, 3)
                            .map(id => nodes.find(n => n.id === id)?.term)
                            .filter(Boolean)
                            .join(', ')}
                          {connectedNodes.size > 3 && ` +${connectedNodes.size - 3}`}
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>
          </>
        )}
      </div>

      {selectedAnnotationId && (
        <AnnotationPopup
          annotationId={selectedAnnotationId}
          onClose={() => setSelectedAnnotationId(null)}
        />
      )}
    </div>
  );
}

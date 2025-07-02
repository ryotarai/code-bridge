.PHONY: server/build
server/build:
	docker build -t code-bridge-server -f Dockerfile.server .

.PHONY: server/load
server/load: server/build
	kind load docker-image code-bridge-server --name code-bridge

.PHONY: dev/deploy
dev/deploy: server/load
	kustomize build ./hack/kube/manifests | KUBECONFIG=tmp/kubeconfig kubectl apply -f -
	KUBECONFIG=tmp/kubeconfig kubectl rollout restart -n code-bridge-system deployment/code-bridge-server

.PHONY: dev/logs
dev/logs:
	KUBECONFIG=tmp/kubeconfig stern -A --container-state running ^code-bridge-

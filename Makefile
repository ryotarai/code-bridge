.PHONY: build
build:
	docker build -t code-bridge-runner --target runner -f Dockerfile .
	docker build -t code-bridge-server --target server -f Dockerfile .

.PHONY: load/server
load/server: build
	kind load docker-image code-bridge-server --name code-bridge

.PHONY: load/runner
load/runner: build
	kind load docker-image code-bridge-runner --name code-bridge

.PHONY: load
load: load/server load/runner

.PHONY: dev/deploy
dev/deploy: load
	kustomize build ./hack/kube/manifests | KUBECONFIG=tmp/kubeconfig kubectl apply -f -
	KUBECONFIG=tmp/kubeconfig kubectl rollout restart -n code-bridge-system deployment/code-bridge-server

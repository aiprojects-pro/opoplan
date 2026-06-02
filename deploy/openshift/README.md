# Despliegue en OKD 4 / OpenShift

Manifests para correr OpoPlan como aplicación nativa en un cluster OpenShift
(probado mental sobre OKD 4.22 SNO con LVM Storage Operator). Asume:

- `oc` CLI autenticado contra el cluster.
- LVM Storage Operator instalado y `LVMCluster` con un StorageClass funcional
  (por defecto `lvms-vg1`). Cambia el nombre en `20-pvc.yaml` si el tuyo es otro.
- IngressController por defecto con cert TLS válido (wildcard *.apps... o
  cert propio para tu host).

## Despliegue paso a paso

```bash
# 1. Namespace
oc apply -f deploy/openshift/00-namespace.yaml

# 2. Configurar el Secret con valores reales
# (edita deploy/openshift/10-secret.yaml sustituyendo los REPLACE_ME)
#
#    SESSION_SECRET:  openssl rand -hex 32
#    VAPID_*:         npx web-push generate-vapid-keys --json
#    APP_URL:         la URL pública (https://opoplan.apps.tu-cluster.example.com)
#    ADMIN/SUPERADMIN credenciales temporales (mustChangePassword=true)
#
# Mejor aún: usa External Secrets Operator + Vault si lo tienes en cluster.
oc apply -f deploy/openshift/10-secret.yaml

# 3. PVCs (data + uploads sobre LVM)
oc apply -f deploy/openshift/20-pvc.yaml
oc get pvc -n opoplan -w     # Espera a que estén Bound

# 4. Build de la imagen DENTRO del cluster
#    Opción A (más rápida): build binario desde tu carpeta local.
oc -n opoplan new-build --strategy=docker --binary --name=opoplan
oc -n opoplan start-build opoplan --from-dir=. --follow

#    Opción B: BuildConfig conectado a un repo git remoto
# (edita deploy/openshift/30-buildconfig.yaml con tu URL y rama)
# oc apply -f deploy/openshift/30-buildconfig.yaml
# oc -n opoplan start-build opoplan --follow

# 5. Deployment, Service, Route, NetworkPolicies y CronJob de backup
oc apply -f deploy/openshift/40-deployment.yaml
oc apply -f deploy/openshift/50-service-route.yaml
oc apply -f deploy/openshift/60-networkpolicy.yaml
oc apply -f deploy/openshift/70-cronjob-backup.yaml

# 6. Verifica
oc -n opoplan get pods -w
oc -n opoplan logs deploy/opoplan -c bootstrap   # mensaje del init
oc -n opoplan logs deploy/opoplan -c app -f      # logs de la app
oc -n opoplan get route opoplan                  # URL pública
```

## Cambiar versión / hacer rollout

Cualquier commit nuevo en el código:

```bash
oc -n opoplan start-build opoplan --from-dir=. --follow
oc -n opoplan rollout status deploy/opoplan
```

Como la `strategy` es `Recreate`, el Pod viejo termina antes de que arranque
el nuevo (~10s de downtime). Es la única opción mientras la BD sea JSON.

## Rollback

```bash
oc -n opoplan rollout undo deploy/opoplan
```

## Backups y restauración

El CronJob `opoplan-backup` corre cada noche a las 03:00 UTC. Lista:

```bash
oc -n opoplan get cronjob opoplan-backup
oc -n opoplan exec deploy/opoplan -c app -- ls -lh /app/data/backups
```

Para restaurar uno (cuidado, destructivo):

```bash
# 1. Para el pod
oc -n opoplan scale deploy/opoplan --replicas=0

# 2. Restaura desde un Pod auxiliar montando el PVC
oc -n opoplan run restore --rm -it --restart=Never \
  --image=registry.access.redhat.com/ubi9-minimal:latest \
  --overrides='{"spec":{"containers":[{"name":"restore","image":"registry.access.redhat.com/ubi9-minimal:latest","command":["bash"],"stdin":true,"tty":true,"volumeMounts":[{"name":"data","mountPath":"/data"}]}],"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"opoplan-data"}}]}}' \
  -- bash
# dentro del shell:
#   cd /data && tar -xzf backups/opoplan-YYYYMMDD...tar.gz --strip-components=1

# 3. Vuelve a arrancar
oc -n opoplan scale deploy/opoplan --replicas=1
```

## Endurecimiento adicional (opcional)

- **External Secrets**: sustituye `10-secret.yaml` por un `ExternalSecret`
  que lea de Vault/AWS Secrets Manager.
- **Pod Security Admission**: el namespace ya cumple `restricted`; añade
  `pod-security.kubernetes.io/enforce: restricted` como label si quieres
  bloqueo a nivel API.
- **Quotas**: añade `ResourceQuota` y `LimitRange` al namespace.
- **VolumeSnapshot**: si tu LVM Operator tiene `VolumeSnapshotClass`,
  programa snapshots nativos del PVC en lugar (o además) del CronJob tar.
- **AuditLog específico**: emite las acciones de admin a un sidecar Fluentd
  hacia Loki/EFK del cluster.

## Si algo falla

```bash
oc -n opoplan describe pod -l app.kubernetes.io/name=opoplan
oc -n opoplan logs deploy/opoplan -c bootstrap --previous
oc -n opoplan logs deploy/opoplan -c app --previous
oc -n opoplan get events --sort-by='.lastTimestamp' | tail -20
```

Los errores más típicos al desplegar por primera vez:

| Síntoma | Causa | Fix |
|---|---|---|
| Pod `CrashLoopBackOff` con `[FATAL] SESSION_SECRET demasiado corto` | El Secret tiene `REPLACE_ME` | Edita el Secret con `openssl rand -hex 32` |
| Pod `CrashLoopBackOff` con `[FATAL] NODE_ENV=production sin VAPID_*` | Faltan claves VAPID | `npx web-push generate-vapid-keys --json` y pega los valores |
| `PVC Pending` | StorageClass mal | `oc get sc` y ajusta `storageClassName` en `20-pvc.yaml` |
| Route 503 | El Pod no está Ready (probes fallan) | Mira `oc logs ... -c app`, lo más típico es que el bootstrap aún no creó la BD |
| `permission denied` al escribir en `/app/data` | Imagen mal construida (no usa gid 0) | Vuelve a hacer `start-build` con el Dockerfile actual del repo |

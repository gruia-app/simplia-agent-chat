@Library('simplia-ci@68ecac795b21d6c06294dd6ffa78b9da40ac95f4') _

pipeline {
  agent {
    label '((linux-docker-medium && (capacity-memory-mib-8192 || capacity-memory-mib-16384 || capacity-memory-mib-32768)) || linux-docker-fallback-16) && !controller'
  }

  options {
    timestamps()
    timeout(time: 60, unit: 'MINUTES')
    skipDefaultCheckout()
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }
    stage('Security Scan') {
      steps {
        script {
          ensureTrivyInstalled()
          def status = sh(label: 'trivy fs', returnStatus: true,
                          script: 'trivy fs --severity HIGH,CRITICAL --exit-code 1 --no-progress .')
          if (status != 0) {
            error 'Trivy security scan failed'
          }
        }
      }
    }
    stage('Verify') {
      steps {
        sh '''#!/usr/bin/env bash
          set -Eeuo pipefail
          corepack enable
          corepack prepare pnpm@9.0.0 --activate
          pnpm install --frozen-lockfile
          pnpm check
        '''
      }
    }
  }
}

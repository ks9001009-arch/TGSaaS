#!/bin/bash
# Persist Docker published-port isolation across reboots (UFW alone is bypassed by docker-proxy).
set -e
iptables -N DOCKER-USER 2>/dev/null || true
iptables -F DOCKER-USER
iptables -A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
iptables -A DOCKER-USER -p tcp -m multiport --dports 5432,6379,4000,3000,8080,8100 -j DROP
iptables -A DOCKER-USER -j RETURN

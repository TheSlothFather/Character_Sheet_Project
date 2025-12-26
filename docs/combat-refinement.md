# Combat Refinement Task List

## Server (Durable Object)
- [x] Align combat V2 entity and event payload shapes (controller, characterId, bestiaryEntryId, entityType, initiative fields) between client and server.
- [x] Implement GM add entity flow: create combat state if missing, insert entity, create initiative entry with timing (immediate/end), and broadcast full initiative + entity update.
- [x] Implement GM move/placement logic with rule-respecting default and a force override, including occupancy checks and AP handling.
- [x] Route GM move requests through the movement handler and broadcast standard movement events.
- [x] Centralize controller-based permission checks (fallback to session list) and apply across movement, initiative, actions, channeling, and damage flows.
- [x] Send full initiative list on initiative updates to keep client state consistent.

## Client (State + Networking)
- [x] Extend `CombatV2Entity`/event types to include controller/ownership and add/update payloads.
- [x] Update combat context to handle add/remove/update events and to derive control from entity.controller + playerId.
- [x] Update initiative handling to accept full lists and robustly merge updates.

## GM Combat UI
- [x] Load campaign members, campaign characters, and bestiary entries for the Add Entity flow.
- [x] Replace the Add Entity modal with a PC/NPC/Monster flow (search, controller assignment, initiative timing).
- [x] Add placement mode UI (banner, cancel, force toggle) and a list of unplaced entities.
- [x] Wire Add Entity to spawn + enter placement mode and hex click to place.

## Player Combat UI
- [x] Derive controlled entities from controller field and update initiative/turn visuals accordingly.
- [x] Enforce movement on the client only when the player controls the selected entity and it is their turn.

## Validation
- [ ] Manual flow check: GM adds PC/NPC/Monster → initiative list updates → placement on grid.
- [ ] Manual flow check: player can move only their controlled tokens on their turn.
- [ ] Manual flow check: force placement bypasses rules; default placement respects occupancy/AP.

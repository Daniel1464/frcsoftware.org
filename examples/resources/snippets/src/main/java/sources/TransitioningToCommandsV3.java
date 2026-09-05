/*
 * Copyright 2026 FRCSoftware
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
package sources;

import org.wpilib.command3.Command;
import org.wpilib.command3.Scheduler;
import org.wpilib.command3.Trigger;

class TransitioningToCommandsV3 {
  private final Subsystem elevator = new Subsystem();
  private final Subsystem wrist = new Subsystem();
  private final Subsystem intake = new Subsystem();

  private final Command commandA = null;
  private final Command commandB = null;
  private final Command commandC = null;

  private final Command intakeCommand = null;
  private final Command shootCommand = null;
  private final Trigger trigger = new Trigger(() -> false);

  void snippets() {
    // [commandsV2Sequence]
    var v2Sequence = Commands.sequence(elevator.moveToL4(), wrist.moveToL4(), intake.outtake());
    // [/commandsV2Sequence]

    // [commandsV3Sequence]
    var v3Sequence = Command.noRequirements(coroutine -> {
          coroutine.await(elevator.moveToL4());
          coroutine.await(wrist.moveToL4());
          coroutine.await(intake.outtake());
        })
        .named("My Sequence");
    // [/commandsV3Sequence]

    // [nonProxySequence]
    var sequence = commandA.andThen(commandB).withAutomaticName();
    var sequence2 = Command.sequence(commandA, commandB, commandC).withAutomaticName();
    // [/nonProxySequence]

    // [scopedCommand]
    Command.noRequirements(coroutine -> {
          // Both are scoped to 'My Command'. When 'My Command' stops,
          // 'intakeCommand' will stop running and 'shootCommand' will no longer run when
          // the trigger activates.
          Scheduler.getDefault().schedule(intakeCommand);
          trigger.onTrue(shootCommand);

          coroutine.park();
        })
        .named("My Command");
    // [/scopedCommand]
  }

  static class Subsystem {
    Command moveToL4() {
      return null;
    }

    Command outtake() {
      return null;
    }
  }

  static class Commands {
    static Command sequence(Command... commands) {
      return null;
    }
  }
}

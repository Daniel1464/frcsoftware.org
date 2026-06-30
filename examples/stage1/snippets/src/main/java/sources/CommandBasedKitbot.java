package sources;

import org.wpilib.command3.Command;
import org.wpilib.command3.Scheduler;
import org.wpilib.command3.button.CommandXboxController;
import org.wpilib.framework.OpModeRobot;
import org.wpilib.opmode.PeriodicOpMode;

class CommandBasedKitbot {
  void schedulerExample() {
    // [robotDef]
    class Robot extends OpModeRobot {
      @Override
      public void robotPeriodic() {
        Scheduler.getDefault().run();
      }
    }
    // [/robotDef]
  }

  class MyTeleop extends PeriodicOpMode {
    private final CommandXboxController xbox = new CommandXboxController(0);

    // [triggerBindingDef]
    public MyTeleop(Robot robot) {
      xbox.leftBumper().whileTrue(robot.intake.intake()).whileTrue(robot.feeder.intake());

      // now fill in the rest...
    }
    // [/triggerBindingDef]
  }

  class ExampleMechanism {
    Command intake() {
      return null;
    }
  }

  class Robot {
    ExampleMechanism intake = new ExampleMechanism();
    ExampleMechanism feeder = new ExampleMechanism();
  }
}

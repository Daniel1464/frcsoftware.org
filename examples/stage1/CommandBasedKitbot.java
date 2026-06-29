void main() {}

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
  // [triggerBindingDef]
  public MyTeleop(Robot robot) {
    xbox.leftBumper()
      .whileTrue(robot.intake.intake())
      .whileTrue(robot.feeder.intake());
    
    // now fill in the rest...
  }
  // [/triggerBindingDef]
}

class ExampleMechanism {
  Command intake() { return null; }
}

class Robot {
  ExampleMechanism intake = new ExampleMechanism();
  ExampleMechanism feeder = new ExampleMechanism();
}

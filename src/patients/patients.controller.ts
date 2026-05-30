import { Controller, Get, Post, Delete, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  async getPatients() {
    return this.patientsService.getPatients();
  }

  @Get('therapists')
  async getTherapists() {
    return this.patientsService.getTherapists();
  }

  @Get('therapists-with-patients')
  async getTherapistsWithPatients() {
    return this.patientsService.getTherapistsWithPatients();
  }

  @Post('assign')
  async assign(@Body() body: { patientId: string; therapistId: string; patientVisibleName?: string; adminLabel?: string }) {
    return this.patientsService.assignTherapist(body.patientId, body.therapistId, body.patientVisibleName, body.adminLabel);
  }

  @Delete('assign/:patientId/:therapistId')
  async remove(@Param('patientId') patientId: string, @Param('therapistId') therapistId: string) {
    return this.patientsService.removeAssignment(patientId, therapistId);
  }

  @Patch(':id/display-name')
  async updateDisplayName(@Param('id') id: string, @Body('displayName') displayName: string) {
    return this.patientsService.updateDisplayName(id, displayName);
  }
}
